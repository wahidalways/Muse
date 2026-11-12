import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { getFilePictures, type FilePicture } from '../../modules/muse-audio-metadata';
import type { MusicTrack } from '../types';
import { coverQuery, searchCovers, type OnlineCover } from '../library/coverSearch';
import { saveImageCover, saveOnlineCover, setSongCover, useSongCover } from '../library/covers';
import { usePreferences } from '../settings/preferences';
import { useAppStyles } from '../theme/styles';
import { EASE_OUT, clamp } from '../motion/motion';
import { hapticSelection } from '../utils/haptics';
import { AlbumArtwork, generatedArtFor } from './AlbumArtwork';
import { HoldToView } from './HoldToView';
import { ControlIcon } from './icons';
import { MuseArtView } from './MuseArt';
import { MuseArtCapture } from './MuseArtCapture';
import { Sheet } from './Sheet';

// ---------------------------------------------------------------------------
// Change cover and the full-size view open from anywhere (song menus, the
// player's cover), so one host in MuseApp shows them, like the toast.

type CoverScreens = { sheet: MusicTrack | null; viewer: MusicTrack | null };
let screens: CoverScreens = { sheet: null, viewer: null };
const listeners = new Set<() => void>();
function show(next: CoverScreens) {
  screens = next;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** A sheet that is closing gets this long first: Android shows one closing and one opening modal badly. */
const SHEET_HANDOFF_MS = 260;

/** Opens Change cover for a song. `afterSheet` waits for another sheet (the song menu) to close first. */
export function openChangeCover(track: MusicTrack, afterSheet = false) {
  if (afterSheet) {
    setTimeout(() => show({ ...screens, sheet: track }), SHEET_HANDOFF_MS);
  } else {
    show({ ...screens, sheet: track });
  }
}

/** Shows a song's cover full size, to zoom into. */
export function openCoverViewer(track: MusicTrack) {
  show({ ...screens, viewer: track });
}

export function CoverHost() {
  const { sheet, viewer } = useSyncExternalStore(subscribe, () => screens);
  return (
    <>
      <ChangeCoverSheet track={sheet} onClose={() => show({ ...screens, sheet: null })} />
      <CoverViewer
        track={viewer}
        onClose={() => show({ ...screens, viewer: null })}
        onChange={(track) => {
          // From Change cover's own preview, closing the view is enough.
          const fromSheet = screens.sheet !== null;
          show({ ...screens, viewer: null });
          if (!fromSheet) {
            openChangeCover(track, true);
          }
        }}
      />
      {/* Saves Muse art as a picture when the lock screen needs one. */}
      <MuseArtCapture />
    </>
  );
}

// ---------------------------------------------------------------------------
// Change cover: the big preview, then one grid. One tap on any cover uses it
// for this song at once; nothing in the music file changes.

/** The sheet's side padding (sleepTimerSheet) and the grid's gap, for three tiles a row. */
const SHEET_PADDING = 22;
const GRID_GAP = 10;
const PREVIEW = 184;

/** ID3/FLAC picture types worth naming; the rest are "In the file". */
const PICTURE_NAMES: Record<number, string> = {
  3: 'Front cover',
  4: 'Back cover',
  5: 'Booklet',
  6: 'Disc',
  7: 'Artist',
  8: 'Artist',
  10: 'Band',
  19: 'Band logo',
  20: 'Label logo',
};

type OnlineState = { status: 'loading' } | { status: 'done'; covers: OnlineCover[]; offline: boolean };

function ChangeCoverSheet({ track, onClose }: { track: MusicTrack | null; onClose: () => void }) {
  return (
    <Sheet visible={track !== null} eyebrow="ARTWORK" title="Change cover" tall closeLabel="Done" onClose={onClose}>
      {track && <ChangeCoverBody track={track} />}
    </Sheet>
  );
}

function ChangeCoverBody({ track }: { track: MusicTrack }) {
  const styles = useAppStyles();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 2 * SHEET_PADDING - 2 * GRID_GAP) / 3);
  const { artworkStyle, bestFileCover, artSet } = usePreferences();
  const cover = useSongCover(track.id);
  /** Which tile is in use: 'original', 'muse', or the chosen picture's ref. */
  const chosen = !cover ? 'original' : cover.kind === 'muse' ? 'muse' : cover.ref;

  // The file's other pictures (a back cover, a booklet...), beside the one it shows.
  const [pictures, setPictures] = useState<FilePicture[]>([]);
  useEffect(() => {
    let isActive = true;
    void getFilePictures(track.id).then((found) => {
      if (isActive) {
        setPictures(found);
      }
    });
    return () => {
      isActive = false;
    };
  }, [track.id]);
  const shownIndex = bestFileCover ? pictures.findIndex((picture) => picture.best) : 0;
  const extras = pictures.map((picture, index) => ({ picture, index })).filter(({ index }) => index !== shownIndex);

  // Covers online, looked up as the sheet opens; "Search" looks again with other words.
  const [query, setQuery] = useState(() => coverQuery(track));
  const [online, setOnline] = useState<OnlineState>({ status: 'loading' });
  const latestSearch = useRef(0);
  const searchField = useRef<ComponentRef<typeof TextInput>>(null);
  // Tags and length rank the results, also when other words are typed.
  const song = { title: track.title, artist: track.artist, album: track.album, duration: track.duration };
  useEffect(() => {
    let isActive = true;
    const settle = (result: OnlineState) => {
      // A search typed meanwhile wins over this first one.
      if (isActive && latestSearch.current === 0) {
        setOnline(result);
      }
    };
    void searchCovers(coverQuery(track), { title: track.title, artist: track.artist, album: track.album, duration: track.duration }).then(
      (result) => settle({ status: 'done', ...result }),
      () => settle({ status: 'done', covers: [], offline: true }),
    );
    return () => {
      isActive = false;
    };
  }, [track]);
  const searchAgain = () => {
    const id = (latestSearch.current += 1);
    setOnline({ status: 'loading' });
    void searchCovers(query, song).then(
      (result) => id === latestSearch.current && setOnline({ status: 'done', ...result }),
      () => id === latestSearch.current && setOnline({ status: 'done', covers: [], offline: true }),
    );
  };

  // A picture is saved into Muse first (online ones download), with a spinner on its tile.
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const applyCover = async (ref: string, save: () => Promise<void>) => {
    // Already in use: nothing to save again. (A new photo always replaces the old one.)
    if (ref === chosen && ref !== 'photo') {
      return;
    }
    hapticSelection();
    setFailed(false);
    setBusy(ref);
    try {
      await save();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  const choosePhoto = async () => {
    const result = await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 1 });
    const photo = result.canceled ? undefined : result.assets[0];
    if (photo) {
      await applyCover('photo', () => saveImageCover(track.id, photo.uri, 'photo'));
    }
  };

  const ownPhoto = cover?.kind === 'image' && cover.ref === 'photo' ? cover.uri : null;
  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.coverSheetPreview}>
        <HoldToView size={PREVIEW} radius={18} label={`Cover of ${track.title}`} onOpen={() => openCoverViewer(track)}>
          <AlbumArtwork track={track} size={PREVIEW} radius={18} full />
        </HoldToView>
      </View>
      <Text numberOfLines={1} style={styles.coverSheetSong}>
        <Text style={styles.coverSheetSongTitle}>{track.title}</Text>
        {track.artist ? ` · ${track.artist}` : ''}
      </Text>
      <Text style={styles.coverSheetHint}>Hold the cover to see it full size</Text>
      {artworkStyle === 'generated' && (
        <Text style={styles.coverError}>Muse art is on for every song (Settings › Artwork). Your choice here shows when that is off.</Text>
      )}

      <Text style={styles.coverSheetLabel}>Tap a cover to use it</Text>
      <View accessibilityRole="radiogroup" style={styles.coverPickGrid}>
        <Tile
          size={tile}
          label="Original"
          selected={chosen === 'original'}
          onPress={() => {
            hapticSelection();
            setSongCover(track.id, null);
          }}
        >
          <AlbumArtwork track={track} size={tile} radius={0} original />
        </Tile>
        {extras.map(({ picture, index }) => {
          const ref = `file:${index}`;
          return (
            <Tile
              key={ref}
              size={tile}
              label={PICTURE_NAMES[picture.type] ?? 'In the file'}
              selected={chosen === ref}
              busy={busy === ref}
              onPress={() => void applyCover(ref, () => saveImageCover(track.id, picture.uri, ref))}
            >
              <Image source={{ uri: picture.uri }} resizeMethod="resize" style={StyleSheet.absoluteFill} />
            </Tile>
          );
        })}
        <Tile
          size={tile}
          label="Muse art"
          selected={chosen === 'muse'}
          onPress={() => {
            hapticSelection();
            setSongCover(track.id, { kind: 'muse' });
          }}
        >
          <MuseArtView art={generatedArtFor(track, artSet)} size={tile} />
        </Tile>
        <Tile
          size={tile}
          label="Your photo"
          hint={ownPhoto ? 'Tap to choose another photo' : 'Choose a photo from your phone'}
          selected={chosen === 'photo'}
          busy={busy === 'photo'}
          onPress={() => void choosePhoto()}
        >
          {ownPhoto ? (
            <Image source={{ uri: ownPhoto }} resizeMethod="resize" style={StyleSheet.absoluteFill} />
          ) : (
            <ControlIcon name="plus" size={28} tone="accent" />
          )}
        </Tile>
      </View>

      <Text style={styles.coverSheetLabel}>Found online</Text>
      <View style={styles.coverSearchRow}>
        <ControlIcon name="search" size={18} tone="muted" />
        <TextInput
          ref={searchField}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={searchAgain}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search for a cover"
          placeholder="Artist and album"
          placeholderTextColor={String(styles.coverMessageText.color)}
          style={styles.coverSearchInput}
        />
        {query.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search words"
            hitSlop={8}
            onPress={() => {
              setQuery('');
              searchField.current?.focus();
            }}
            style={styles.coverSearchClear}
          >
            <ControlIcon name="close" size={16} tone="muted" />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={searchAgain} style={styles.coverSearchButton}>
          <Text style={styles.coverSearchButtonText}>Search</Text>
        </Pressable>
      </View>
      {online.status === 'loading' ? (
        <View accessible accessibilityLabel="Looking for covers online" style={styles.coverPickGrid}>
          {Array.from({ length: 6 }, (_, index) => (
            <View key={index} style={[styles.coverTilePic, { width: tile, height: tile }]} />
          ))}
        </View>
      ) : online.offline ? (
        <>
          <View style={styles.coverMessage}>
            <Text style={styles.coverMessageTitle}>You&apos;re offline</Text>
            <Text style={styles.coverMessageText}>Connect to the internet to see more covers.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={searchAgain} style={[styles.coverLink, styles.coverLinkCentered]}>
            <Text style={styles.coverLinkText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          {online.covers.length > 0 ? (
            <View accessibilityRole="radiogroup" style={styles.coverPickGrid}>
              {online.covers.map((item) => (
                <Tile
                  key={item.id}
                  size={tile}
                  label={item.name || item.source}
                  caption={item.artist}
                  hint={`From ${item.source}`}
                  selected={chosen === item.id}
                  busy={busy === item.id}
                  onPress={() => void applyCover(item.id, () => saveOnlineCover(track.id, item.full, item.id))}
                >
                  <Image source={{ uri: item.preview }} resizeMethod="resize" style={StyleSheet.absoluteFill} />
                </Tile>
              ))}
            </View>
          ) : (
            <View style={styles.coverMessage}>
              <Text style={styles.coverMessageTitle}>No covers found</Text>
              <Text style={styles.coverMessageText}>Try fewer words, such as just the artist and album.</Text>
            </View>
          )}
        </>
      )}
      {failed && (
        <Text accessibilityLiveRegion="polite" style={styles.coverError}>
          Could not save that cover. Please try another one.
        </Text>
      )}
    </ScrollView>
  );
}

/** One cover in the grid: the picture, an outline and check when in use, a spinner while saving, its name. */
function Tile({
  size,
  label,
  caption,
  hint,
  selected,
  busy = false,
  onPress,
  children,
}: {
  size: number;
  label: string;
  /** A quieter second line, such as the album's artist. */
  caption?: string;
  hint?: string;
  selected: boolean;
  busy?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      accessibilityHint={hint}
      accessibilityState={{ checked: selected, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [{ width: size }, pressed && styles.coverTilePressed]}
    >
      <View>
        <View style={[styles.coverTilePic, { width: size, height: size }]}>{children}</View>
        {selected && <View pointerEvents="none" style={styles.coverTileRing} />}
        {busy && (
          <View style={tileLayout.busy}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
        {selected && (
          <View pointerEvents="none" style={styles.coverTileCheck}>
            <ControlIcon name="check" size={14} color={String(styles.sheetDoneText.color)} />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.coverTileName, selected && styles.coverTileNameOn]}>
        {label}
      </Text>
      {caption ? (
        <Text numberOfLines={1} style={styles.coverTileCaption}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// The full-size view: the cover as stored, on black, to zoom into.

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const ZOOM = { duration: 260, easing: EASE_OUT };

function CoverViewer({
  track,
  onClose,
  onChange,
}: {
  track: MusicTrack | null;
  onClose: () => void;
  onChange: (track: MusicTrack) => void;
}) {
  return (
    <Modal visible={track !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Gestures inside an Android modal need their own root. */}
      <GestureHandlerRootView style={viewerLayout.root}>
        {track && <ViewerBody track={track} onClose={onClose} onChange={() => onChange(track)} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

function ViewerBody({ track, onClose, onChange }: { track: MusicTrack; onClose: () => void; onChange: () => void }) {
  const { width: size } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Pinch to zoom (1x to 4x), drag to look around while zoomed, double-tap to zoom in or out.
  const pinch = usePinchGesture({
    onUpdate: (event) => {
      'worklet';
      scale.set(clamp(savedScale.get() * event.scale, 1, MAX_ZOOM));
    },
    onDeactivate: () => {
      'worklet';
      const zoom = scale.get();
      savedScale.set(zoom);
      const room = (size * zoom - size) / 2;
      x.set(withTiming(clamp(x.get(), -room, room), ZOOM));
      y.set(withTiming(clamp(y.get(), -room, room), ZOOM));
    },
  });
  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      startX.set(x.get());
      startY.set(y.get());
    },
    onUpdate: (event) => {
      'worklet';
      const room = (size * scale.get() - size) / 2;
      x.set(clamp(startX.get() + event.translationX, -room, room));
      y.set(clamp(startY.get() + event.translationY, -room, room));
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (event) => {
      'worklet';
      if (scale.get() > 1) {
        scale.set(withTiming(1, ZOOM));
        savedScale.set(1);
        x.set(withTiming(0, ZOOM));
        y.set(withTiming(0, ZOOM));
        return;
      }
      // Zoom in where the finger tapped, so that spot stays under it.
      const room = (size * DOUBLE_TAP_ZOOM - size) / 2;
      scale.set(withTiming(DOUBLE_TAP_ZOOM, ZOOM));
      savedScale.set(DOUBLE_TAP_ZOOM);
      x.set(withTiming(clamp((size / 2 - event.x) * (DOUBLE_TAP_ZOOM - 1), -room, room), ZOOM));
      y.set(withTiming(clamp((size / 2 - event.y) * (DOUBLE_TAP_ZOOM - 1), -room, room), ZOOM));
    },
  });
  const zoomAndMove = useSimultaneousGestures(pinch, pan);
  const gesture = useExclusiveGestures(doubleTap, zoomAndMove);
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <View style={[viewerLayout.root, viewerLayout.black]}>
      <View style={[viewerLayout.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={viewerLayout.close}>
          <ControlIcon name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={viewerLayout.stage}>
        <GestureDetector gesture={gesture}>
          <Animated.View accessibilityHint="Pinch or double-tap to zoom" style={zoomStyle}>
            <AlbumArtwork track={track} size={size} radius={0} full zoom />
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={[viewerLayout.foot, { paddingBottom: insets.bottom + 24 }]}>
        <Text numberOfLines={1} style={viewerLayout.title}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={viewerLayout.artist}>
          {track.artist ?? 'Unknown artist'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onChange}
          style={({ pressed }) => [viewerLayout.change, pressed && viewerLayout.pressed]}
        >
          <ControlIcon name="image" size={18} color="#000000" />
          <Text style={viewerLayout.changeText}>Change cover</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Black and white in both themes, so these skip the theme's color conversion.
const viewerLayout = StyleSheet.create({
  root: {
    flex: 1,
  },
  black: {
    backgroundColor: '#000000',
  },
  top: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  foot: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  artist: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 2,
  },
  change: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    borderRadius: 26,
    marginTop: 20,
    backgroundColor: '#FFFFFF',
  },
  changeText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});

const tileLayout = StyleSheet.create({
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
