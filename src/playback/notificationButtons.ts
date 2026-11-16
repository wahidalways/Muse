import { addNotificationActionListener, setNotificationButtons } from '../../modules/muse-audio-metadata/files';
import { isFavorite, subscribeFavorites, toggleFavorite } from '../library/favorites';
import type { PlaybackController } from './PlaybackController';

/**
 * The playback notification's ♥ and shuffle buttons: kept in step with the
 * song and its heart, and their taps acted on. Runs for the player's whole
 * life, so they work while Muse's screen is closed.
 */
export function syncNotificationButtons(controller: PlaybackController) {
  let shown = '';
  const push = () => {
    const { currentTrack, shuffle } = controller.getSnapshot();
    const favorite = currentTrack ? isFavorite(currentTrack.id) : null;
    const key = `${favorite}:${shuffle}`;
    // The snapshot changes on every play, pause and buffering: tell Android only real changes.
    if (key !== shown) {
      shown = key;
      setNotificationButtons(favorite, currentTrack ? shuffle : null);
    }
  };
  push();
  controller.subscribe(push);
  subscribeFavorites(push);
  addNotificationActionListener((action) => {
    const track = controller.getSnapshot().currentTrack;
    if (action === 'favorite' && track) {
      toggleFavorite(track.id);
    } else if (action === 'shuffle') {
      controller.toggleShuffle();
    }
  });
}
