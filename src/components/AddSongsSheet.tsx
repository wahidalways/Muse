import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { MusicTrack } from '../types';
import { buildSearchIndex, matchesAllWords, searchWords } from '../library/search';
import { addToPlaylist, type Playlist } from '../library/playlists';
import { AlbumArtwork } from './AlbumArtwork';
import { ControlIcon } from './icons';
import { Sheet } from './Sheet';
import { colors, useAppStyles } from '../theme/styles';

const NO_ANCHOR = { disabled: true };

/** Search the library and tick songs to add to a playlist. */
export function AddSongsSheet({
  playlist,
  tracks,
  visible,
  onClose,
}: {
  playlist: Playlist;
  /** Every playable song. */
  tracks: MusicTrack[];
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useAppStyles();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const words = useMemo(() => searchWords(deferredSearch), [deferredSearch]);
  // Only while open: the sheet sits mounted (hidden) on every playlist page,
  // and indexing the whole library there cost every visit.
  const searchIndex = useMemo(() => (visible ? buildSearchIndex(tracks) : null), [tracks, visible]);
  const present = useMemo(() => new Set(playlist.trackIds), [playlist.trackIds]);
  const shown = useMemo(
    () =>
      words.length > 0
        ? tracks.filter((track) => matchesAllWords(searchIndex?.get(track.id) ?? '', words))
        : tracks,
    [searchIndex, tracks, words],
  );

  const close = () => {
    setSearch('');
    setPicked([]);
    setShowHint(false);
    onClose();
  };
  const toggle = (trackId: string) => {
    setShowHint(false);
    setPicked((current) =>
      current.includes(trackId) ? current.filter((id) => id !== trackId) : [...current, trackId],
    );
  };

  return (
    <Sheet visible={visible} eyebrow={playlist.name.toUpperCase()} title="Add songs" onClose={close} tall>
      <View style={styles.sheetSearch}>
        <TextInput
          accessibilityLabel="Search songs to add"
          onChangeText={setSearch}
          placeholder="Search songs, artists, albums"
          placeholderTextColor={colors.muted}
          style={styles.sheetInput}
          value={search}
        />
      </View>
      <View style={styles.sheetListFill}>
        <FlashList
          data={shown}
          keyExtractor={(track) => track.id}
          // Filtering must not scroll to wherever the old top row went (FlashList
          // keeps it in view by default, which suits chats, not search).
          maintainVisibleContentPosition={NO_ANCHOR}
          extraData={picked}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const already = present.has(item.id);
            const selected = already || picked.includes(item.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: already }}
                accessibilityLabel={`${item.title}${already ? ', already in playlist' : ''}`}
                disabled={already}
                onPress={() => toggle(item.id)}
                style={styles.pickRow}
              >
                <AlbumArtwork track={item} size={40} />
                <View style={styles.homeSongCopy}>
                  <Text numberOfLines={1} style={styles.homeSongTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.homeSongHint}>
                    {already ? 'Already added' : item.artist || 'Unknown artist'}
                  </Text>
                </View>
                <View style={[styles.pickCheck, selected && styles.pickCheckOn]}>
                  {selected && <ControlIcon name="check" size={13} tone="accent" />}
                </View>
              </Pressable>
            );
          }}
        />
      </View>
      {showHint && <Text style={styles.sheetHint}>Tick at least one song to add.</Text>}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (picked.length === 0) {
            setShowHint(true);
            return;
          }
          addToPlaylist(playlist.id, picked);
          close();
        }}
        style={[styles.primaryButton, styles.sheetFooterButton]}
      >
        <Text style={styles.primaryButtonLabel}>
          {picked.length > 0 ? `Add ${picked.length} ${picked.length === 1 ? 'song' : 'songs'}` : 'Add songs'}
        </Text>
      </Pressable>
    </Sheet>
  );
}
