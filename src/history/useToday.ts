import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { dayKey } from './stats';

/**
 * Today's day key. It changes at midnight, and is checked again whenever
 * Muse comes back to the front (timers wait in the background), so stats
 * that read "today" rebuild when the day turns: put it in their memo deps.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => dayKey(Date.now()));
  useEffect(() => {
    // The same text leaves React with nothing to re-render.
    const check = () => setToday(dayKey(Date.now()));
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(check, midnight.getTime() - Date.now() + 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);
  return today;
}
