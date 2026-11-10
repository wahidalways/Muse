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

/** Default widgets, order and sizes, and the recap folded again. The week start is left as chosen. */
export function resetBoard() {
  store.update((current) => ({ ...current, board: DEFAULT_PULSE.board.map((item) => ({ ...item })), recapOpen: null }));
}

/** The recap for the week starting on `weekKey` was opened. */
export function markRecapSeen(weekKey: string) {
  store.update((current) => (current.recapSeen === weekKey ? current : { ...current, recapSeen: weekKey }));
}

/** Opens the recap of the week starting on `weekKey`, or folds it to its slim row (null). Every new week's recap starts folded. */
export function openRecapCard(weekKey: string | null) {
  store.update((current) => ({ ...current, recapOpen: weekKey }));
}

/** The goal moment played today (a day key), so it plays once a day. */
export function markGoalCelebrated(day: string) {
  store.update((current) => (current.goalCelebrated === day ? current : { ...current, goalCelebrated: day }));
}
