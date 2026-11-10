import { getArtworkFile, getCoverThumb, getFullCover, getLockScreenCover } from '../../modules/muse-audio-metadata';
import { generatedArtFor, generatedArtName } from '../components/AlbumArtwork';
import { museArtFile } from '../components/MuseArtCapture';
import { getSongCover } from '../library/covers';
import { getPreferences } from '../settings/preferences';
import type { MusicTrack } from '../types';

/** Everything that decides the lock screen's picture; when it changes, the picture is sent again. */
export function lockScreenCoverKey(track: MusicTrack): string {
  const cover = getSongCover(track.id);
  const { artworkStyle, bestFileCover, artSet } = getPreferences();
  return [cover?.kind === 'image' ? cover.uri : (cover?.kind ?? ''), artworkStyle, bestFileCover, artSet].join('|');
}

/**
 * The cover the app shows, as a file:// picture the lock screen can load:
 * the song's own, else the file's (the best picture in it when that setting
 * is on), else Muse art, saved as a picture. Big pictures go as a copy
 * capped at 1440 px (getLockScreenCover): the lock screen never shows more. Muse art also
 * stands in for songs without a cover, as everywhere in the app.
 */
export async function lockScreenArtwork(track: MusicTrack): Promise<string | null> {
  const cover = getSongCover(track.id);
  const { artworkStyle, bestFileCover, artSet } = getPreferences();
  const museArt = () => museArtFile(`${artSet}:${generatedArtName(track)}`, generatedArtFor(track, artSet));
  if (artworkStyle === 'generated' || cover?.kind === 'muse') {
    return museArt();
  }
  if (cover?.kind === 'image') {
    return (await getLockScreenCover(cover.uri)) ?? museArt();
  }
  const source = track.albumArtUri;
  if (source && !source.startsWith('content://')) {
    // Bundled or downloaded art (the sample songs): already a file the lock screen can load.
    return source;
  }
  if (source) {
    const full = await getFullCover(track.id, bestFileCover);
    const sized = full ? await getLockScreenCover(full.uri) : null;
    const file = sized ?? (await (bestFileCover ? getCoverThumb(track.id) : getArtworkFile(track.id)));
    if (file) {
      return file;
    }
  }
  return museArt();
}
