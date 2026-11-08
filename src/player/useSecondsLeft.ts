import { useEffect, useState } from 'react';

function secondsUntil(endsAt: number | null): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

/**
 * A once-a-second countdown to `endsAt`, kept inside the component that shows
 * it so the rest of the app does not re-render every second. Display only:
 * the playback controller decides when the timer actually ends.
 */
export function useSecondsLeft(endsAt: number | null): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (endsAt === null) {
      return;
    }
    const intervalId = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(intervalId);
  }, [endsAt]);

  return secondsUntil(endsAt);
}
