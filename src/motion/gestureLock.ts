import { makeMutable } from 'react-native-reanimated';

/**
 * True while something under the finger owns sideways drags (a chart being
 * scrubbed), so the page-wide tab swipe leaves the drag alone. Read on the
 * UI thread by the swipe, set from the JS touch handlers that own the drag.
 */
export const sidewaysDragLock = makeMutable(false);
