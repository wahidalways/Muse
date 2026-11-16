import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Pressable } from '../components/Pressable';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { EASE_OUT } from '../motion/motion';
import { ThemeContext } from '../theme/theme';
import type { MusicTrack, RepeatMode } from '../types';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { ControlIcon } from '../components/icons';
import { EqualizerBars } from '../components/EqualizerBars';
import { NamePrompt } from '../components/NamePrompt';
import { showToast } from '../components/Toast';
import { addToPlaylist, createPlaylist } from '../library/playlists';
import { getPlaybackController } from '../playback/PlaybackController';
import { useAppStyles } from '../theme/styles';
import { hapticSelection } from '../utils/haptics';
import { QueueDragGhost, QueueRow, useQueueDrag, type QueueScroller } from './UpNextList';

/** Songs played before, shown above the current one. */
const HISTORY_SHOWN = 30;
const LIST_FADE = { duration: 160, easing: EASE_OUT };

type Item =
  | { kind: 'label'; key: string; text: string }
  | { kind: 'past'; key: string; track: MusicTrack }
  | { kind: 'now'; key: string; track: MusicTrack }
  | { kind: 'head'; key: string; count: number }
  | { kind: 'next'; key: string; track: MusicTrack; index: number }
  | { kind: 'empty'; key: string };
const getKey = (item: Item) => item.key;
const getType = (item: Item) => item.kind;

/**
 * Up Next, in the full player. Opens on the current song; what played
 * before is just above it (scroll up), dimmed, and plays again on a tap.
 * Below: the whole queue in a recycling list, so a queue of thousands
 * costs the same as thirty. Hold a song (or press its handle) and drag it to
 * a new place, swipe left to remove.
 */
export function QueuePane({
  queue,
  currentIndex,
  recent,
  isPlaying,
  shuffle,
  repeatMode,
  onSelect,
  onMove,
  onRemove,
  onToggleShuffle,
  onCycleRepeat,
}: {
  queue: MusicTrack[];
  currentIndex: number;
  /** Recently played songs, newest first. */
  recent: MusicTrack[];
  isPlaying: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  onSelect: (queueIndex: number) => void;
  onMove: (fromQueueIndex: number, toQueueIndex: number) => void;
  onRemove: (queueIndex: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}) {
  const styles = useAppStyles();
  const { theme } = useContext(ThemeContext);
  // See-through, so the chips read on the player's tinted background.
  const chip = useMemo(
    () => ({ backgroundColor: theme === 'light' ? 'rgba(25, 34, 24, 0.08)' : 'rgba(255, 255, 255, 0.12)' }),
    [theme],
  );
  const [isNaming, setIsNaming] = useState(false);
  const current = queue[currentIndex];
  const upcoming = useMemo(() => queue.slice(currentIndex + 1), [currentIndex, queue]);
  const firstQueueIndex = currentIndex + 1;
  const items = useMemo(() => {
    const list: Item[] = [];
    const past = recent.filter((track) => track.id !== current?.id).slice(0, HISTORY_SHOWN).reverse();
    if (past.length > 0) {
      list.push({ kind: 'label', key: 'label:past', text: 'PLAYED' });
      // Recent songs are unique. Keys follow the song, not its spot (see below).
      past.forEach((track) => list.push({ kind: 'past', key: `past:${track.id}`, track }));
    }
    list.push({ kind: 'label', key: 'label:now', text: 'NOW PLAYING' });
    if (current) {
      list.push({ kind: 'now', key: 'now', track: current });
    }
    list.push({ kind: 'head', key: 'head', count: upcoming.length });
    if (upcoming.length === 0) {
      list.push({ kind: 'empty', key: 'empty' });
    }
    // Keyed by song (counting repeats, as a song can be queued twice), not by
    // position: a reorder, a removal or the next song then moves rows instead
    // of handing every row below to another song, which redrew every cover.
    const seen = new Map<string, number>();
    upcoming.forEach((track, index) => {
      const repeat = seen.get(track.id) ?? 0;
      seen.set(track.id, repeat + 1);
      list.push({ kind: 'next', key: `next:${track.id}#${repeat}`, track, index });
    });
    return list;
  }, [current, recent, upcoming]);
  // The pane opens with "Now playing" at the top.
  const [initialIndex] = useState(() => items.findIndex((item) => item.key === 'label:now'));
  // FlashList fills its first screen in batches and settles the scroll to
  // "Now playing" over a few frames. The list fades in once that is done, so
  // rows never pop in or jump while the pane comes in.
  const listShown = useSharedValue(0);
  const listStyle = useAnimatedStyle(() => ({ opacity: listShown.get() }));
  const showList = useCallback(() => listShown.set(withTiming(1, LIST_FADE)), [listShown]);

  const move = useCallback(
    (from: number, to: number) => onMove(firstQueueIndex + from, firstQueueIndex + to),
    [firstQueueIndex, onMove],
  );
  // Where the list is scrolled to and how far it goes, for a drag that scrolls it at the edges.
  const listRef = useRef<FlashListRef<Item>>(null);
  const scroll = useRef({ offset: 0, content: 0, view: 0 });
  const trackScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scroll.current = { offset: contentOffset.y, content: contentSize.height, view: layoutMeasurement.height };
  }, []);
  const scroller = useMemo<QueueScroller>(
    () => ({
      offset: () => scroll.current.offset,
      max: () => scroll.current.content - scroll.current.view,
      scrollTo: (offset) => {
        scroll.current.offset = offset;
        listRef.current?.scrollToOffset({ offset, animated: false });
      },
    }),
    [],
  );
  // Dragging a song (see useQueueDrag): rows start it, this pane's wrapper keeps the finger.
  const { values, ghost, wrapperRef, startDrag, responder, dragging, reset } = useQueueDrag(upcoming.length, move, scroller);
  // A song ending mid-drag shifts Up Next too, so a held song is let go then as well.
  useLayoutEffect(reset, [reset, queue, currentIndex]);

  const saveAsPlaylist = (name: string) => {
    setIsNaming(false);
    const songs = [current, ...upcoming].filter((track): track is MusicTrack => Boolean(track));
    addToPlaylist(createPlaylist(name), songs.map((track) => track.id));
    showToast('Saved as playlist', { detail: `${name} · ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`, icon: 'playlist' });
  };

  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) => {
      switch (item.kind) {
        case 'label':
          return <Text style={styles.playerPaneLabel}>{item.text}</Text>;
        case 'past':
        case 'now': {
          const past = item.kind === 'past';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={past ? `Play ${item.track.title} again` : `Now playing, ${item.track.title}`}
              disabled={!past}
              onPress={() => {
                hapticSelection();
                getPlaybackController().playNow(item.track);
              }}
              style={[styles.playerPaneRow, past && styles.playerPaneRowPast]}
            >
              <View style={styles.libraryArtWrap}>
                <AlbumArtwork track={item.track} size={40} />
                {!past && (
                  <View style={styles.libraryArtOverlay}>
                    <EqualizerBars playing={isPlaying} size={14} />
                  </View>
                )}
              </View>
              <View style={styles.playerQueueCopy}>
                <Text numberOfLines={1} style={[styles.playerQueueTitle, !past && styles.libraryTrackTitleCurrent]}>
                  {item.track.title}
                </Text>
                <Text numberOfLines={1} style={styles.playerQueueArtist}>
                  {item.track.artist || item.track.folderTitle}
                </Text>
              </View>
            </Pressable>
          );
        }
        case 'head':
          return (
            <View style={styles.playerPaneHead}>
              <View style={styles.playerPaneHeadRow}>
                <Text style={[styles.playerPaneLabel, styles.playerPaneLabelInline]}>UP NEXT</Text>
                <Text style={styles.playerPaneCount}>
                  {item.count} {item.count === 1 ? 'song' : 'songs'}
                </Text>
                <View style={styles.flexSpacer} />
                {item.count > 0 && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Save Up Next as a playlist"
                      onPress={() => setIsNaming(true)}
                      style={[styles.playerPaneChip, chip]}
                    >
                      <Text style={styles.playerPaneChipText}>Save as playlist</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear Up Next"
                      onPress={() => {
                        hapticSelection();
                        getPlaybackController().clearUpNext();
                        showToast('Up Next cleared', { icon: 'queue' });
                      }}
                      style={[styles.playerPaneChip, chip]}
                    >
                      <Text style={styles.playerPaneChipText}>Clear</Text>
                    </Pressable>
                  </>
                )}
              </View>
              <View style={styles.playerPaneModes}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: shuffle }}
                  onPress={onToggleShuffle}
                  style={[styles.playerPaneChip, styles.playerPanePill, chip]}
                >
                  <ControlIcon name="shuffle" size={15} tone={shuffle ? 'accent' : 'muted'} />
                  <Text style={[styles.playerPaneChipText, shuffle ? styles.playerPanePillOn : styles.playerPanePillOff]}>Shuffle</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={repeatMode === 'none' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
                  onPress={onCycleRepeat}
                  style={[styles.playerPaneChip, styles.playerPanePill, chip]}
                >
                  <ControlIcon name="repeat" size={15} tone={repeatMode !== 'none' ? 'accent' : 'muted'} showOne={repeatMode === 'single'} />
                  <Text style={[styles.playerPaneChipText, repeatMode !== 'none' ? styles.playerPanePillOn : styles.playerPanePillOff]}>
                    {repeatMode === 'none' ? 'Repeat' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        case 'empty':
          return <Text style={styles.playerPaneEmptyText}>Nothing after this song. Swipe songs in Library to add them.</Text>;
        case 'next':
          return (
            <QueueRow
              track={item.track}
              index={item.index}
              count={upcoming.length}
              queueIndex={firstQueueIndex + item.index}
              drag={values}
              last={item.index === upcoming.length - 1}
              onStartDrag={startDrag}
              onSelect={onSelect}
              onMove={move}
              onRemove={onRemove}
              removeLabel="Remove from Up Next"
              plain
            />
          );
      }
    },
    [chip, startDrag, values, firstQueueIndex, isPlaying, move, onCycleRepeat, onRemove, onSelect, onToggleShuffle, repeatMode, shuffle, styles, upcoming.length],
  );

  return (
    <>
      <Animated.View ref={wrapperRef} collapsable={false} style={[styles.flexSpacer, listStyle]} {...responder}>
        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={getKey}
          getItemType={getType}
          renderItem={renderItem}
          // Still while a song is dragged, so the drag keeps the finger.
          scrollEnabled={!dragging}
          initialScrollIndex={Math.max(0, initialIndex)}
          onLoad={showList}
          onScroll={trackScroll}
          onContentSizeChange={(_width, height) => {
            scroll.current.content = height;
          }}
          onLayout={(event) => {
            scroll.current.view = event.nativeEvent.layout.height;
          }}
          contentContainerStyle={styles.playerPaneList}
          showsVerticalScrollIndicator={false}
        />
        {/* The song being dragged floats here, above the list and its recycling. */}
        <QueueDragGhost ghost={ghost} plain />
      </Animated.View>
      <NamePrompt
        visible={isNaming}
        title="Save Up Next"
        initialName="Up Next"
        actionLabel="Save playlist"
        onClose={() => setIsNaming(false)}
        onSubmit={saveAsPlaylist}
      />
    </>
  );
}
