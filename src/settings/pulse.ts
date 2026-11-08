import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { WeekStart } from '../history/stats';
import { createSavedStore } from '../library/savedStore';
import { DEFAULT_PULSE, parsePulse, type BoardItem, type PulseSettings } from './pulseBoard';

const store = createSavedStore<PulseSettings>(AsyncStorage, '@muse/pulse/v1', DEFAULT_PULSE, parsePulse);

export function usePulse(): PulseSettings {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function setBoard(board: BoardItem[]) {
  store.update((current) => ({ ...current, board }));
}

export function setWeekStart(weekStart: WeekStart) {
  store.update((current) => ({ ...current, weekStart }));
}

/** Default widgets, order and sizes, and a hidden recap back. The week start is left as chosen. */
export function resetBoard() {
  store.update((current) => ({ ...current, board: DEFAULT_PULSE.board.map((item) => ({ ...item })), recapHidden: null }));
}

/** The recap for the week starting on `weekKey` was opened. */
export function markRecapSeen(weekKey: string) {
  store.update((current) => (current.recapSeen === weekKey ? current : { ...current, recapSeen: weekKey }));
}

/** Hides the recap tile until the next week's recap. */
export function hideRecap(weekKey: string) {
  store.update((current) => ({ ...current, recapHidden: weekKey }));
}
