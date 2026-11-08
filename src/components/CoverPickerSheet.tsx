import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type { MusicTrack } from '../types';
import {
  setPlaylistCoverPhoto,
  setPlaylistCoverTrack,
  type Playlist,
} from '../library/playlists';
import { AlbumArtwork } from './AlbumArtwork';
import { ControlIcon } from './icons';
import { Sheet, SheetRow } from './Sheet';
import { useAppStyles } from '../theme/styles';

/**
 * Pick the playlist's cover, which is also its banner: a photo from the
 * phone, the album art of one of its songs, or the automatic collage.
 */
export function CoverPickerSheet({
  playlist,
  tracks,
  visible,
  onClose,
}: {
  playlist: Playlist;
  /** The playlist's songs in the library. */
  tracks: MusicTrack[];
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useAppStyles();
  const [error, setError] = useState('');
  // One choice per song: songs grouped into one album can still carry
  // different covers.
  const albumCovers = tracks.filter((track) => track.albumArtUri !== null);

  const pickPhoto = async () => {
    setError('');
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) {
        return;
      }
      await setPlaylistCoverPhoto(playlist.id, result.assets[0].uri);
      onClose();
    } catch {
      setError('Could not use that photo. Please try another one.');
    }
  };

  return (
    <Sheet visible={visible} eyebrow="COVER AND BANNER" title={playlist.name} onClose={onClose}>
      <View style={styles.sheetBody}>
        <SheetRow
          icon={<ControlIcon name="image" size={18} tone="accent" />}
          label="Choose a photo"
          detail="From your phone"
          onPress={pickPhoto}
        />
        <SheetRow
          icon={<ControlIcon name="playlist" size={18} tone="accent" />}
          label="Automatic"
          detail={!playlist.coverUri && !playlist.coverTrackId ? 'In use' : 'Song covers'}
          onPress={() => {
            setPlaylistCoverTrack(playlist.id, null);
            onClose();
          }}
        />
        {error ? <Text style={styles.sheetHint}>{error}</Text> : null}
        {albumCovers.length > 0 && (
          <>
            <Text style={styles.sortSheetSectionTitle}>FROM SONGS IN THIS PLAYLIST</Text>
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.coverGrid}>
              {albumCovers.map((track) => {
                const selected = playlist.coverTrackId === track.id;
                return (
                  <Pressable
                    key={track.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${track.album || track.title} cover`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setPlaylistCoverTrack(playlist.id, track.id);
                      onClose();
                    }}
                    style={[styles.coverChoice, selected && styles.coverChoiceSelected]}
                  >
                    <AlbumArtwork track={track} size={86} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>
    </Sheet>
  );
}
