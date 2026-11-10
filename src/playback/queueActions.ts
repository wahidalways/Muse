import type { MusicTrack } from '../types';
import { getPlaybackController } from './PlaybackController';
import { showToast } from '../components/Toast';
import { hapticSuccess } from '../utils/haptics';

/**
 * Play next and Add to queue, with the confirmation every entry point shows
 * (row swipes, song and album menus, the selection bar).
 */
function queue(tracks: MusicTrack[], position: 'next' | 'end') {
  const controller = getPlaybackController();
  const wasIdle = controller.getSnapshot().currentTrack === null;
  const count = controller.enqueue(tracks, position);
  if (count === 0) {
    showToast(tracks.some((track) => track.uri) ? 'That song is playing now' : 'This song is not available', { icon: 'info' });
    return;
  }
  hapticSuccess();
  const detail = tracks.length === 1 ? tracks[0].title : `${count} songs`;
  if (wasIdle) {
    showToast('Playing', { detail, icon: 'play' });
  } else if (position === 'next') {
    showToast('Playing next', { detail, icon: 'play-next' });
  } else {
    showToast('Added to queue', { detail, icon: 'queue-add' });
  }
}

export const playNext = (tracks: MusicTrack[]) => queue(tracks, 'next');
export const addToQueue = (tracks: MusicTrack[]) => queue(tracks, 'end');
