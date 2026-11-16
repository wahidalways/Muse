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
