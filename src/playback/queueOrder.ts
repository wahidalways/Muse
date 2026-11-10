/**
 * The queue after Play next (`next`) or Add to queue (`end`). Songs already
 * coming up move rather than play twice; what played before, and the
 * current song at `index`, stay where they are. `adds` must not hold the
 * current song.
 */
export function withQueued<T extends { id: string }>(queue: T[], index: number, adds: T[], position: 'next' | 'end'): T[] {
  const ids = new Set(adds.map((track) => track.id));
  const head = queue.slice(0, index + 1);
  const rest = queue.slice(index + 1).filter((track) => !ids.has(track.id));
  return position === 'next' ? [...head, ...adds, ...rest] : [...head, ...rest, ...adds];
}
