import { useState } from 'react';
import { ScrollView } from 'react-native';
import type { MusicTrack } from '../types';
import { addToPlaylist, createPlaylist, usePlaylists } from '../library/playlists';
import { ControlIcon } from './icons';
import { NamePrompt } from './NamePrompt';
import { Sheet, SheetRow } from './Sheet';
import { showToast } from './Toast';
import { useAppStyles } from '../theme/styles';

/**
 * Adds several songs (a selection, an album) to a playlist, or to a new one.
 * Songs already in the playlist are skipped.
 */
export function PlaylistPickerSheet({ tracks, onClose }: { tracks: MusicTrack[] | null; onClose: () => void }) {
  const styles = useAppStyles();
  const playlists = usePlaylists();
  const [isNaming, setIsNaming] = useState(false);
  if (!tracks) {
    return null;
  }
  const add = (playlistId: string, name: string) => {
    addToPlaylist(playlistId, tracks.map((track) => track.id));
    showToast('Added to playlist', { detail: name, icon: 'playlist-add' });
    onClose();
  };
  return (
    <>
      <Sheet
        visible={!isNaming}
        eyebrow="ADD TO PLAYLIST"
        title={tracks.length === 1 ? tracks[0].title : `${tracks.length} songs`}
        onClose={onClose}
      >
        <ScrollView style={styles.sheetList}>
          <SheetRow
            icon={<ControlIcon name="plus" size={18} tone="accent" />}
            label="New playlist"
            onPress={() => setIsNaming(true)}
          />
          {playlists.map((playlist) => (
            <SheetRow
              key={playlist.id}
              icon={<ControlIcon name="playlist" size={18} tone="muted" />}
              label={playlist.name}
              detail={`${playlist.trackIds.length} ${playlist.trackIds.length === 1 ? 'song' : 'songs'}`}
              onPress={() => add(playlist.id, playlist.name)}
            />
          ))}
        </ScrollView>
      </Sheet>
      <NamePrompt
        visible={isNaming}
        title="New playlist"
        actionLabel="Create and add"
        onClose={() => setIsNaming(false)}
        onSubmit={(name) => {
          setIsNaming(false);
          add(createPlaylist(name), name);
        }}
      />
    </>
  );
}
