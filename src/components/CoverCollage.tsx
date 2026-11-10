import { Image, View } from 'react-native';
import type { MusicTrack } from '../types';
import type { Playlist } from '../library/playlists';
import type { Mix } from '../history/mixes';
import { useMixCover } from '../library/mixCovers';
import { AlbumArtwork } from './AlbumArtwork';
import { ControlIcon, type ControlIconName } from './icons';
import { useAppStyles } from '../theme/styles';
import { usePreferences } from '../settings/preferences';

/** Up to four covers from different albums in a 2x2 grid, or one big cover. */
export function CoverCollage({
  tracks,
  size,
  radius = 10,
  emptyIcon = 'note',
}: {
  tracks: MusicTrack[];
  size: number;
  radius?: number;
  /** Drawn on a soft tile when there are no songs: what will go here. */
  emptyIcon?: ControlIconName;
}) {
  const styles = useAppStyles();
  const covers: MusicTrack[] = [];
  const albums = new Set<string>();
  for (const track of tracks) {
    const album = track.album ?? track.id;
    if (!albums.has(album)) {
      albums.add(album);
      covers.push(track);
      if (covers.length === 4) break;
    }
  }
  return (
    <View
      style={[
        styles.coverCollage,
        !covers[0] && styles.coverCollageEmpty,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      {covers.length === 4 ? (
        covers.map((track) => (
          <AlbumArtwork key={track.id} track={track} size={size / 2} radius={0} />
        ))
      ) : covers[0] ? (
        <AlbumArtwork track={covers[0]} size={size} radius={0} />
      ) : (
        // An icon, not a "♫" character: font line spacing pushed that off centre.
        <ControlIcon name={emptyIcon} size={Math.round(size * 0.24)} tone="muted" />
      )}
    </View>
  );
}

/** A Home mix's cover: the photo picked for it, or its song covers. */
export function MixCover({ mix, size, radius = 14 }: { mix: Mix; size: number; radius?: number }) {
  const styles = useAppStyles();
  const uri = useMixCover(mix.id);
  // Muse art everywhere also covers a photo picked for the mix; the photo stays saved.
  const realCovers = usePreferences().artworkStyle === 'covers';
  if (uri && realCovers) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri }}
        resizeMode="cover"
        style={[styles.coverCollage, { width: size, height: size, borderRadius: radius }]}
      />
    );
  }
  return <CoverCollage tracks={mix.tracks} size={size} radius={radius} />;
}

/** A playlist's cover: its photo, its chosen song's art, or a collage. */
export function PlaylistCover({
  playlist,
  tracks,
  size,
  radius = 12,
}: {
  playlist: Playlist;
  /** The playlist's songs that are in the library, in order. */
  tracks: MusicTrack[];
  size: number;
  radius?: number;
}) {
  const styles = useAppStyles();
  const realCovers = usePreferences().artworkStyle === 'covers';
  if (playlist.coverUri && realCovers) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: playlist.coverUri }}
        resizeMode="cover"
        style={[styles.coverCollage, { width: size, height: size, borderRadius: radius }]}
      />
    );
  }
  const chosen = tracks.find((track) => track.id === playlist.coverTrackId);
  return <CoverCollage tracks={chosen ? [chosen] : tracks} size={size} radius={radius} />;
}
