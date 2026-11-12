import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createSavedStore } from '../library/savedStore';

/**
 * Muse looks for a new release by itself, at most once a day, and says so in
 * a popup with what's new. "Don't remind me" pauses that popup for a week,
 * two weeks or a month (Settings still shows a waiting update), or turns the
 * reminders off. After an update, What's new shows once.
 */
export type UpdatePrompt = {
  /** Settings › About & updates › Tell me about updates. */
  autoCheck: boolean;
  /** When the daily check last got an answer (ms). */
  lastCheck: number;
  /** No update sheet before this time (ms), or null. */
  snoozeUntil: number | null;
  /** The newest version GitHub had at the last check, when newer than this app. */
  waitingVersion: string | null;
  /** The app version What's new was last handled for; null until the first launch has run. */
  seenVersion: string | null;
};

const DEFAULT: UpdatePrompt = { autoCheck: true, lastCheck: 0, snoozeUntil: null, waitingVersion: null, seenVersion: null };
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
/** "Don't remind me" choices; `days: null` turns the reminders off. */
export const SNOOZE_CHOICES = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: null, label: 'Never' },
] as const;

const store = createSavedStore<UpdatePrompt>(AsyncStorage, '@muse/update-prompt/v1', DEFAULT, (value) => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as Partial<UpdatePrompt>;
  return {
    autoCheck: saved.autoCheck !== false,
    lastCheck: typeof saved.lastCheck === 'number' ? saved.lastCheck : 0,
    snoozeUntil: typeof saved.snoozeUntil === 'number' ? saved.snoozeUntil : null,
    waitingVersion: typeof saved.waitingVersion === 'string' ? saved.waitingVersion : null,
    seenVersion: typeof saved.seenVersion === 'string' ? saved.seenVersion : null,
  };
});

export const updatePromptReady = store.ready;
export const getUpdatePrompt = () => store.get();

export function useUpdatePrompt(): UpdatePrompt {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function changeUpdatePrompt(change: Partial<UpdatePrompt>) {
  store.update((current) => ({ ...current, ...change }));
}

/** Whether the daily check is due now. */
export function isCheckDue(prompt: UpdatePrompt, now: number): boolean {
  return prompt.autoCheck && now - prompt.lastCheck >= CHECK_EVERY_MS;
}

/** Whether the sheet may show now (not paused). */
export function isSnoozed(prompt: UpdatePrompt, now: number): boolean {
  return prompt.snoozeUntil !== null && now < prompt.snoozeUntil;
}
