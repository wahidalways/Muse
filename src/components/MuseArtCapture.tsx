import { useEffect, useRef, useSyncExternalStore, type ComponentRef } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { MuseArtView, type Art } from './MuseArt';

/**
 * Muse art is drawn by the app, not stored as a file, so the lock screen gets
 * a picture of it: drawn off screen at this many pixels a side and saved as a
 * PNG, once per design per session. (The share cards are made the same way.)
 */
const CAPTURE_PX = 1024;
/** The lock screen's title never waits longer than this for the art. */
const CAPTURE_TIMEOUT_MS = 3000;

type Job = { key: string; art: Art; waiters: ((uri: string | null) => void)[] };
const saved = new Map<string, string>();
let jobs: Job[] = [];
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function setJobs(next: Job[]) {
  jobs = next;
  listeners.forEach((listener) => listener());
}

/** A PNG file of this Muse art, or null when it could not be made in time. `key` names the design. */
export function museArtFile(key: string, art: Art): Promise<string | null> {
  const known = saved.get(key);
  if (known) {
    return Promise.resolve(known);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS);
    const finish = (uri: string | null) => {
      clearTimeout(timer);
      resolve(uri);
    };
    const waiting = jobs.find((job) => job.key === key);
    if (waiting) {
      waiting.waiters.push(finish);
    } else {
      setJobs([...jobs, { key, art, waiters: [finish] }]);
    }
  });
}

/** Draws the next Muse art waiting for a picture, off screen, and saves it. Mounted once (CoverHost). */
export function MuseArtCapture() {
  const job = useSyncExternalStore(subscribe, () => jobs[0] ?? null);
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!job) {
      return;
    }
    let isActive = true;
    // One frame first, so the art has been drawn when it is captured.
    const frame = requestAnimationFrame(() => {
      void captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', width: CAPTURE_PX, height: CAPTURE_PX })
        .then(
          (uri) => uri,
          () => null,
        )
        .then((uri) => {
          if (!isActive) {
            return;
          }
          if (uri) {
            saved.set(job.key, uri);
          }
          job.waiters.forEach((waiter) => waiter(uri));
          setJobs(jobs.filter((item) => item !== job));
        });
    });
    return () => {
      isActive = false;
      cancelAnimationFrame(frame);
    };
  }, [job]);

  if (!job) {
    return null;
  }
  return (
    <View pointerEvents="none" style={layout.offscreen}>
      <View ref={ref} collapsable={false}>
        <MuseArtView art={job.art} size={CAPTURE_PX / PixelRatio.get()} />
      </View>
    </View>
  );
}

const layout = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
});
