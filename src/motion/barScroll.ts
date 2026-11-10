import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Whether the glass tab bar is shrunk to its small form. Any page's scroll
 * sets it: down a little way shrinks the bar, up brings it back. One app-wide
 * value, so the page lists need no props to reach the bar.
 */
let minimized = false;
const listeners = new Set<() => void>();

export function setBarMinimized(next: boolean): void {
  if (next !== minimized) {
    minimized = next;
    listeners.forEach((listener) => listener());
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () => minimized;

/**
 * Hidden while Library is picking songs: its own action bar takes the
 * dock's place. One app-wide flag, so the dock needs no props for it.
 */
let dockHidden = false;
const dockListeners = new Set<() => void>();
export function setDockHidden(next: boolean): void {
  if (next !== dockHidden) {
    dockHidden = next;
    dockListeners.forEach((listener) => listener());
  }
}
const subscribeDock = (listener: () => void) => {
  dockListeners.add(listener);
  return () => {
    dockListeners.delete(listener);
  };
};
const readDock = () => dockHidden;
export function useDockHidden(): boolean {
  return useSyncExternalStore(subscribeDock, readDock, readDock);
}

export function useBarMinimized(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}

/** How far a scroll must keep going one way before the bar follows. */
const TRAVEL = 48;
/** Near the top the bar is always full. */
const TOP_ZONE = 80;

/**
 * An `onScroll` for one scroll view. Each view keeps its own last position,
 * so switching tabs never reads as a jump. Pair it with
 * `scrollEventThrottle={32}`.
 */
export function useBarScroll() {
  const at = useBarScrollAt();
  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      at(contentOffset.y, contentSize.height, layoutMeasurement.height);
    },
    [at],
  );
}

/**
 * The same, fed plain numbers: for a scroll view whose scroll handler runs on
 * the UI thread and only sends a position over now and then.
 */
export function useBarScrollAt() {
  const lastY = useRef(0);
  const travel = useRef(0);
  return useCallback((y: number, contentHeight: number, viewHeight: number) => {
    const delta = y - lastY.current;
    lastY.current = y;
    if (y <= TOP_ZONE) {
      travel.current = 0;
      setBarMinimized(false);
      return;
    }
    // The bounce at the end of a list is not a real scroll up or down.
    if (y + viewHeight >= contentHeight - 4) {
      travel.current = 0;
      return;
    }
    // Distance in one direction; turning around starts the count again.
    travel.current =
      Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
    if (travel.current > TRAVEL) {
      setBarMinimized(true);
    } else if (travel.current < -TRAVEL) {
      setBarMinimized(false);
    }
  }, []);
}
