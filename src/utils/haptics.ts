import * as Haptics from 'expo-haptics';
import { getPreferences } from '../settings/preferences';

/**
 * Small, iOS-style haptics, off when the Haptic feedback setting is off.
 * A phone without a vibration motor (or Expo web) just does nothing.
 */

/** Choosing between options: tabs, segments, switches. */
export function hapticSelection() {
  if (getPreferences().haptics) {
    Haptics.selectionAsync().catch(() => undefined);
  }
}

/** A gesture or press that commits: play/pause, skip, a swipe that lands. */
export function hapticImpact() {
  if (getPreferences().haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }
}

/** A real achievement, such as reaching the daily goal. */
export function hapticSuccess() {
  if (getPreferences().haptics) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }
}
