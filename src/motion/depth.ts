import { makeMutable, withSpring } from 'react-native-reanimated';

import { SETTLE_SPRING } from './motion';

/**
 * How far a bottom sheet over the app is open, 0 to 1, on the UI thread. The
 * app steps back with it (MuseApp's recede style), the way it does behind the
 * full player; a drag on the sheet moves it with the finger.
 */
export const sheetDepth = makeMutable(0);

/** Sheets open now; a sheet over a sheet keeps the app back until both close. */
let openSheets = 0;

export function settleSheetDepth(open: boolean) {
  openSheets = Math.max(0, openSheets + (open ? 1 : -1));
  sheetDepth.set(withSpring(openSheets > 0 ? 1 : 0, SETTLE_SPRING));
}

/**
 * Android's back swipe while Muse can go back in-app (Android 14+): how far
 * along it is, 0 to 1, and which edge it came from (1 left, -1 right). The
 * app content shrinks and shifts with it, the way Android previews a back.
 */
export const backProgress = makeMutable(0);
export const backEdge = makeMutable(1);
