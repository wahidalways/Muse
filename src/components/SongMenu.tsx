import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { MusicTrack } from '../types';
import { toggleFavorite, useIsFavorite } from '../library/favorites';
import {
  addToPlaylist,
  createPlaylist,
  removeFromPlaylist,
  usePlaylists,
} from '../library/playlists';
import { canDeleteTrack } from '../library/library';
import { AlbumArtwork } from './AlbumArtwork';
import { openChangeCover } from './CoverSheets';
import { ControlIcon } from './icons';
import { NamePrompt } from './NamePrompt';
import { SongInfo } from './SongInfo';
import { Sheet, SheetRow } from './Sheet';
import { StarRating } from './StarRating';
import { useAppStyles } from '../theme/styles';
import { getPlaybackController } from '../playback/PlaybackController';
import { addToQueue, playNext } from '../playback/queueActions';

/**
 * Everything you can do to one song: rate it, love it, add it to or remove
 * it from playlists, and see its info. Opened by a long-press on any song
 * row, the mini player, and the full player.
 */
export function SongMenu({
  track,
  playlistId,
  playCount,
  initialView,
  extra,
  onDelete,
  onClose,
}: {
  track: MusicTrack | null;
  /** More rows above Delete; the full player adds its player settings here. */
  extra?: ReactNode;
  /** 'info' opens straight on Song info. */
  initialView?: 'info';
  /** How often this song was played, for its Song info. */
  playCount: number;
  /** Set when opened from inside a playlist, to offer removing it. */
  playlistId?: string;
  /** Deletes the song's file from the phone. */
  onDelete: (track: MusicTrack) => void;
  onClose: () => void;
}) {
  const [isNaming, setIsNaming] = useState(false);
  if (!track) {
    return null;
  }
  return (
    <>
      <Sheet visible={!isNaming} eyebrow="SONG" title={track.title} onClose={onClose}>
        {/* Inside the modal, so each opening starts on the main actions. */}
        <SongMenuBody
          track={track}
          playlistId={playlistId}
          playCount={playCount}
          initialView={initialView}
          extra={extra}
          onClose={onClose}
          onNewPlaylist={() => setIsNaming(true)}
          onDelete={() => {
            onClose();
            onDelete(track);
          }}
        />
      </Sheet>
      <NamePrompt
        visible={isNaming}
        title="New playlist"
        actionLabel="Create and add"
        onClose={() => setIsNaming(false)}
        onSubmit={(name) => {
          addToPlaylist(createPlaylist(name), [track.id]);
          setIsNaming(false);
          onClose();
        }}
      />
    </>
  );
}

function SongMenuBody({
  track,
  playlistId,
  playCount,
  initialView,
  extra,
  onClose,
  onNewPlaylist,
  onDelete,
}: {
  track: MusicTrack;
  playlistId?: string;
  playCount: number;
  initialView?: 'info';
  extra?: ReactNode;
  onClose: () => void;
  onNewPlaylist: () => void;
  onDelete: () => void;
}) {
  const styles = useAppStyles();
  const playlists = usePlaylists();
  const isFavorite = useIsFavorite(track.id);
  // Playlists and Song info open in place, inside the same sheet.
  const [view, setView] = useState<'actions' | 'playlists' | 'info'>(initialView ?? 'actions');
  const current = playlists.find((playlist) => playlist.id === playlistId);
  // The playing song cannot be queued after itself.
  const isPlayingNow = getPlaybackController().getSnapshot().currentTrack?.id === track.id;

  if (view === 'info') {
    return <SongInfo track={track} playCount={playCount} />;
  }
  if (view === 'playlists') {
    return (
      <ScrollView style={styles.sheetList}>
        <Text style={styles.sortSheetSectionTitle}>ADD TO PLAYLIST</Text>
        <SheetRow
          icon={<ControlIcon name="plus" size={18} tone="accent" />}
          label="New playlist"
          onPress={onNewPlaylist}
        />
        {playlists.map((playlist) => {
          const added = playlist.trackIds.includes(track.id);
          return (
            <SheetRow
              key={playlist.id}
              icon={<ControlIcon name={added ? 'check' : 'playlist'} size={18} tone={added ? 'accent' : 'muted'} />}
              label={playlist.name}
              detail={added ? 'Added' : `${playlist.trackIds.length} songs`}
              onPress={() =>
                added ? removeFromPlaylist(playlist.id, track.id) : addToPlaylist(playlist.id, [track.id])
              }
            />
          );
        })}
      </ScrollView>
    );
  }

  return (
    // Scrolls when the full player's settings make it taller than the screen.
    <ScrollView
      style={styles.songMenuScroll}
      contentContainerStyle={styles.sheetBody}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.songMenuHeader}>
        <AlbumArtwork track={track} size={52} />
        <View style={styles.homeSongCopy}>
          <Text numberOfLines={1} style={styles.homeSongHint}>
            {[track.artist, track.album].filter(Boolean).join(' · ') || 'Unknown artist'}
          </Text>
          <StarRating trackId={track.id} size={22} />
        </View>
      </View>
      {!isPlayingNow && (
        <>
          <SheetRow
            icon={<ControlIcon name="play-next" size={18} tone="accent" />}
            label="Play next"
            onPress={() => {
              onClose();
              playNext([track]);
            }}
          />
          <SheetRow
            icon={<ControlIcon name="queue-add" size={18} tone="accent" />}
            label="Add to queue"
            onPress={() => {
              onClose();
              addToQueue([track]);
            }}
          />
        </>
      )}
      <SheetRow
        icon={<ControlIcon name={isFavorite ? 'heart' : 'heart-outline'} size={18} tone="accent" />}
        label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        onPress={() => toggleFavorite(track.id)}
      />
      <SheetRow
        icon={<ControlIcon name="playlist-add" size={18} tone="accent" />}
        label="Add to playlist"
        onPress={() => setView('playlists')}
      />
      <SheetRow
        icon={<ControlIcon name="image" size={18} tone="accent" />}
        label="Change cover"
        onPress={() => {
          onClose();
          openChangeCover(track, true);
        }}
      />
      <SheetRow
        icon={<ControlIcon name="info" size={18} tone="accent" />}
        label="Song info"
        detail="Tags and file"
        onPress={() => setView('info')}
      />
      {current && (
        <SheetRow
          icon={<ControlIcon name="delete" size={18} tone="muted" />}
          label={`Remove from ${current.name}`}
          danger
          onPress={() => {
            removeFromPlaylist(current.id, track.id);
            onClose();
          }}
        />
      )}
      {extra}
      {/* Always shown, so it is easy to find. Android asks to confirm before
          anything is deleted; sample songs explain why they cannot be. */}
      <SheetRow
        icon={<ControlIcon name="delete" size={18} tone="muted" />}
        label="Delete from phone"
        detail={canDeleteTrack(track) ? 'Removes the file' : 'Sample song'}
        danger
        onPress={onDelete}
      />
    </ScrollView>
  );
}
