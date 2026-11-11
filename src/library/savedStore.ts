/**
 * A small value saved on the phone and shared outside React: read it in a
 * component with `useSyncExternalStore(store.subscribe, store.get)`.
 *
 * No runtime imports, and storage is passed in, so `scripts/check-stats.mjs`
 * can test it with a fake. The app passes AsyncStorage.
 */

export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function createSavedStore<T>(
  storage: KeyValueStorage,
  key: string,
  initial: T,
  /** Returns null for anything unreadable, which keeps the initial value. */
  parse: (value: unknown) => T | null,
) {
  let current = initial;
  let loaded = false;
  /**
   * The read itself failed, so the saved copy may still be fine: nothing is
   * written this session. (Corrupt text is unrecoverable, so it may be.)
   */
  let readFailed = false;
  /** Changes made before the saved copy arrived, to replay on top of it. */
  let pending: ((value: T) => T)[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  // A failed save only loses the change on the next launch.
  const save = () => storage.setItem(key, JSON.stringify(current)).catch(() => undefined);

  // Loads right away, at app start, so the window for early changes is tiny.
  const ready = storage
    .getItem(key)
    .then(
      (value) => {
        const saved = value ? parse(JSON.parse(value)) : null;
        // Replay early changes on the saved copy. Saving them over it instead
        // would erase everything saved before.
        current = pending.reduce((value, change) => change(value), saved ?? initial);
        return pending.length > 0;
      },
      // Unreadable: keep what we have, but never overwrite what may be there.
      () => {
        readFailed = true;
        return false;
      },
    )
    .catch(() => false)
    .then((hasEarlyChanges) => {
      loaded = true;
      pending = [];
      notify();
      if (hasEarlyChanges) {
        return save();
      }
    });

  return {
    get: () => current,
    /** True once the saved copy, or the lack of one, is known. */
    loaded: () => loaded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(change: (value: T) => T) {
      const next = change(current);
      // Nothing changed: no re-render and no write. Before the load, the
      // change is still kept, since it may not be a no-op on the saved copy.
      if (loaded && next === current) {
        return;
      }
      current = next;
      notify();
      if (loaded) {
        if (!readFailed) {
          void save();
        }
      } else {
        pending.push(change);
      }
    },
    /** Settles once the saved copy has loaded. For tests. */
    ready,
  };
}
