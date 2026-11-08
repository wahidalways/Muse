import { Image, Text, View } from 'react-native';
import type { MusicTrack } from '../types';
import type { Playlist } from '../library/playlists';
import { AlbumArtwork } from './AlbumArtwork';
import { useAppStyles } from '../theme/styles';

/** Up to four covers from different albums in a 2x2 grid, or one big cover. */
export function CoverCollage({
  tracks,
  size,
  radius = 10,
}: {
  tracks: MusicTrack[];
  size: number;
  radius?: number;
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
        <Text style={[styles.coverCollageNote, { fontSize: size * 0.3 }]}>♫</Text>
      )}
    </View>
  );
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
  if (playlist.coverUri) {
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
