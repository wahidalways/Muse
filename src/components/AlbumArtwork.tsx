import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { getArtworkFile, getCoverThumb, getFullCover } from '../../modules/muse-audio-metadata';
import type { MusicTrack } from '../types';
import { useAppStyles } from '../theme/styles';
import { getPreferences, usePreferences, type ArtSet } from '../settings/preferences';
import { getSongCover, useSongCover } from '../library/covers';
import { MuseArtView, museArt } from './MuseArt';
import { hueOf } from '../theme/dynamicAccent';

/**
 * Album art read from the phone arrives as a legacy `content://…/albumart/<id>`
 * address, which many Android versions no longer serve reliably. Those go
 * through the native module instead, as files:
 * - thumb: a list-size JPEG (512 px), made from the best picture in the song's
 *   file when Settings › Best cover in the file is on, else Android's own;
 * - full: the cover exactly as stored in the file, for the player and the
 *   full-size view. Quality is never reduced there.
 * Bundled art and `file://` paths load directly.
 *
 * Results are cached for the session per song, not per album: Android puts
 * untagged songs in one folder into a single album, yet each file can carry
 * its own cover.
 */
type Variant = 'thumb' | 'full';
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

function artworkKey(trackId: string, variant: Variant, best: boolean): string {
  return `${variant}:${best ? 'best' : 'android'}:${trackId}`;
}

function requestArtwork(trackId: string, variant: Variant, best: boolean): Promise<string | null> {
  const key = artworkKey(trackId, variant, best);
  let request = pendingArtwork.get(key);
  if (!request) {
    const load =
      variant === 'full'
        ? getFullCover(trackId, best).then((cover) => cover?.uri ?? null)
        : best
          ? getCoverThumb(trackId)
          : getArtworkFile(trackId);
    request = load.then((uri) => {
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
 * the song does: the list copy (awaited) and the full one (started). Never
 * rejects: a missing cover just shows the placeholder.
 */
export function preloadArtwork(track: MusicTrack): Promise<void> {
  const source = track.albumArtUri;
  const best = getPreferences().bestFileCover;
  if (!source || !needsNativeArtwork(source) || getSongCover(track.id)) {
    return Promise.resolve();
  }
  if (!resolvedArtwork.has(artworkKey(track.id, 'full', best))) {
    void requestArtwork(track.id, 'full', best);
  }
  if (resolvedArtwork.has(artworkKey(track.id, 'thumb', best))) {
    return Promise.resolve();
  }
  return requestArtwork(track.id, 'thumb', best).then(
    () => undefined,
    () => undefined,
  );
}

type ArtworkState = { uri: string | null; pending: boolean };
const NO_COVER: ArtworkState = { uri: null, pending: false };

/**
 * The image address to show for a track (null: it has none), and whether the
 * phone is still being asked. Off while Muse art or the song's own cover shows,
 * so no cover is read at all.
 */
function useArtworkUri(track: MusicTrack, variant: Variant, best: boolean, enabled: boolean): ArtworkState {
  const source = track.albumArtUri;
  const isNative = source !== null && needsNativeArtwork(source);
  const key = artworkKey(track.id, variant, best);
  const [loaded, setLoaded] = useState<{ key: string; uri: string | null } | null>(null);

  useEffect(() => {
    if (!enabled || !source || !isNative || resolvedArtwork.has(key)) {
      return;
    }
    let isActive = true;
    void requestArtwork(track.id, variant, best).then((uri) => {
      if (isActive) {
        setLoaded({ key, uri });
      }
    });
    return () => {
      isActive = false;
    };
  }, [best, enabled, isNative, key, source, track.id, variant]);

  if (!enabled || !source) {
    return NO_COVER;
  }
  if (!isNative) {
    return { uri: source, pending: false };
  }
  if (resolvedArtwork.has(key)) {
    return { uri: resolvedArtwork.get(key) ?? null, pending: false };
  }
  return loaded?.key === key ? { uri: loaded.uri, pending: false } : { uri: null, pending: true };
}

/** What a song's Muse art is drawn from: its album (or folder, or title when untagged). */
export function generatedArtName(track: MusicTrack): string {
  return track.album || track.folderTitle || track.title;
}

/** A song's Muse art in the chosen style. */
export function generatedArtFor(track: MusicTrack, set: ArtSet) {
  return museArt(generatedArtName(track), set);
}

/** The main hue of a song's Muse art, for tints that follow the art. */
export function generatedArtHue(track: MusicTrack, set: ArtSet): number {
  return hueOf(generatedArtFor(track, set).background);
}

export function AlbumArtwork({
  track,
  size,
  radius,
  full = false,
  original = false,
  zoom = false,
}: {
  track: MusicTrack;
  size: number;
  /** Corner radius. By default it scales with the size. */
  radius?: number;
  /** The cover exactly as stored (player and full-size view); lists use the small copy. */
  full?: boolean;
  /** The file's own cover, ignoring one chosen in Change cover. */
  original?: boolean;
  /** Decodes every pixel, for pinch zoom (the full-size view only). */
  zoom?: boolean;
}) {
  const styles = useAppStyles();
  const { artworkStyle, artSet, bestFileCover } = usePreferences();
  const ownCover = useSongCover(track.id);
  const chosen = original ? undefined : ownCover;
  const realCovers = artworkStyle === 'covers' && chosen?.kind !== 'muse';
  const chosenImage = realCovers && chosen?.kind === 'image' ? chosen.uri : null;
  const thumb = useArtworkUri(track, 'thumb', bestFileCover, realCovers && chosenImage === null);
  const big = useArtworkUri(track, 'full', bestFileCover, full && realCovers && chosenImage === null);
  // The full copy draws over the small one, so the cover never goes blank while it loads.
  const below = chosenImage ?? thumb.uri;
  const above = full && chosenImage === null && big.uri !== thumb.uri ? big.uri : null;
  // Remember which image failed rather than "failed" for this component.
  // Recycled list rows reuse the component for a different song, and that
  // song's art must still get its own try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showBelow = below !== null && failedUri !== below;
  const showAbove = above !== null && failedUri !== above;
  // Muse art only once it is known there is no cover. While a cover is still
  // being read the tile stays plain, so bright art never flashes before it.
  const art = !showBelow && !showAbove && !thumb.pending && !big.pending ? generatedArtFor(track, artSet) : null;
  // Decoded at the size shown, which looks the same: a 4000 px cover kept
  // whole is 64 MB in memory, and the player stays mounted while closed.
  // A little over the shown size (1.25), since the decoder can round down.
  // Only the zoomable full-size view keeps every pixel.
  const resizeMethod = zoom ? 'scale' : 'resize';
  const resizeMultiplier = full && !zoom ? 1.25 : undefined;

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
        // Art runs edge to edge: the frame's 1dp border would shift every shape and clip two edges.
        art && styles.playerArtworkBare,
      ]}
    >
      {art && (
        // Decoration only: screen readers skip it (the Letter style's letter included).
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={StyleSheet.absoluteFill}>
          <MuseArtView art={art} size={size} />
        </View>
      )}
      {showBelow && (
        <Image
          accessibilityLabel={`${track.album || track.title} album cover`}
          source={{ uri: below }}
          resizeMode="cover"
          resizeMethod={resizeMethod}
          resizeMultiplier={resizeMultiplier}
          style={styles.playerArtworkImage}
          onError={() => setFailedUri(below)}
          // No fade: recycled rows would visibly flash as they scroll in.
          fadeDuration={0}
        />
      )}
      {showAbove && (
        <Image
          accessibilityLabel={`${track.album || track.title} album cover`}
          source={{ uri: above }}
          resizeMode="cover"
          resizeMethod={resizeMethod}
          resizeMultiplier={resizeMultiplier}
          style={styles.playerArtworkImage}
          onError={() => setFailedUri(above)}
          fadeDuration={0}
        />
      )}
    </View>
  );
}
