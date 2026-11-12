import type { WidgetState } from './state';

// No React Native imports: scripts/check-stats.mjs runs this in Node.

/** This phone's local date as YYYY-MM-DD, `daysAgo` days back. */
export function localDay(daysAgo = 0, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Saved numbers seen on a later day, with Muse closed: today starts at 0,
 * and a streak whose last day was before yesterday has ended.
 */
export function freshForToday(state: WidgetState, now = new Date()): WidgetState {
  if (!state.day || state.day === localDay(0, now)) {
    return state;
  }
  return { ...state, todayMinutes: 0, streak: state.day === localDay(1, now) ? state.streak : 0 };
}
