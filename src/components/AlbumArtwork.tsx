import { useContext, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeContext } from '../theme/theme';

import { getArtworkFile } from '../../modules/muse-audio-metadata';
import type { MusicTrack } from '../types';
import { useAppStyles } from '../theme/styles';

/**
 * Album art read from the phone arrives as a legacy `content://…/albumart/<id>`
 * address, which many Android versions no longer serve reliably. Those go
 * through the native module instead: it uses Android's thumbnail API and
 * saves a small JPEG per album. Bundled art and `file://`
 * paths load directly.
 *
 * Results are cached for the session per song, not per album: Android puts
 * untagged songs in one folder into a single album, yet each file can carry
 * its own cover.
 */
const resolvedArtwork = new Map<string, string | null>();
const pendingArtwork = new Map<string, Promise<string | null>>();

/** Forgets resolved covers, after the cached files were deleted (Settings › Storage). */
export function clearArtworkMemory() {
  resolvedArtwork.clear();
  pendingArtwork.clear();
}

function needsNativeArtwork(uri: string): boolean {
  return uri.startsWith('content://');
}

function requestArtwork(track: MusicTrack, key: string): Promise<string | null> {
  let request = pendingArtwork.get(key);
  if (!request) {
    request = getArtworkFile(track.id).then((uri) => {
      resolvedArtwork.set(key, uri);
      pendingArtwork.delete(key);
      return uri;
    });
    pendingArtwork.set(key, request);
  }
  return request;
}

/**
 * Reads a track's cover ahead of showing it, so it does not pop in after
 * the song does. Never rejects: a missing cover just shows the placeholder.
 */
export function preloadArtwork(track: MusicTrack): Promise<void> {
  const source = track.albumArtUri;
  if (!source || !needsNativeArtwork(source) || resolvedArtwork.has(track.id)) {
    return Promise.resolve();
  }
  return requestArtwork(track, track.id).then(
    () => undefined,
    () => undefined,
  );
}

/** The image address to show for a track, or null for the placeholder. */
function useArtworkUri(track: MusicTrack): string | null {
  const source = track.albumArtUri;
  const isNative = source !== null && needsNativeArtwork(source);
  const key = track.id;
  const [loaded, setLoaded] = useState<{ key: string; uri: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!source || !isNative || resolvedArtwork.has(key)) {
      return;
    }
    let isActive = true;
    void requestArtwork(track, key).then((uri) => {
      if (isActive) {
        setLoaded({ key, uri });
      }
    });
    return () => {
      isActive = false;
    };
  }, [isNative, key, source, track]);

  if (!source) {
    return null;
  }
  if (!isNative) {
    return source;
  }
  if (resolvedArtwork.has(key)) {
    return resolvedArtwork.get(key) ?? null;
  }
  return loaded?.key === key ? loaded.uri : null;
}

/**
 * The no-cover tile's colors, from the album name: the same album always
 * gets the same hue. Low saturation, so the tiles stay calm beside real art
 * and the neutral glass.
 */
export function placeholderColors(name: string, light: boolean): { background: string; glyph: string } {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return light
    ? { background: `hsl(${hue}, 26%, 84%)`, glyph: `hsl(${hue}, 24%, 50%)` }
    : // Light enough to stand off the near-black page, still calm.
      { background: `hsl(${hue}, 18%, 31%)`, glyph: `hsl(${hue}, 26%, 70%)` };
}

export function AlbumArtwork({
  track,
  size,
  radius,
}: {
  track: MusicTrack;
  size: number;
  /** Corner radius. By default it scales with the size. */
  radius?: number;
}) {
  const styles = useAppStyles();
  const { theme } = useContext(ThemeContext);
  const artworkUri = useArtworkUri(track);
  // Remember which image failed rather than "failed" for this component.
  // Recycled list rows reuse the component for a different song, and that
  // song's art must still get its own try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = artworkUri !== null && failedUri !== artworkUri;
  const tile = placeholderColors(track.album || track.folderTitle || track.title, theme === 'light');

  return (
    <View
      style={[
        styles.playerArtwork,
        size >= 140 && styles.playerArtworkLarge,
        {
          width: size,
          height: size,
          borderRadius: radius ?? Math.min(24, Math.max(10, size * 0.085)),
        },
      ]}
    >
      {/* No cover: a calm tile, one muted color per album, so a list of
          untagged files gets some rhythm instead of identical discs. */}
      <View style={[styles.playerArtworkFallback, { backgroundColor: tile.background }]}>
        <Ionicons accessible={false} name="musical-note" size={Math.round(size * 0.38)} color={tile.glyph} />
      </View>
      {showImage && (
        <Image
          accessibilityLabel={`${track.album || track.title} album cover`}
          source={{ uri: artworkUri }}
          resizeMode="cover"
          // Decode at the size shown, not the full cover image.
          resizeMethod="resize"
          style={styles.playerArtworkImage}
          onError={() => setFailedUri(artworkUri)}
          // No fade: recycled rows would visibly flash as they scroll in.
          fadeDuration={0}
        />
      )}
    </View>
  );
}
