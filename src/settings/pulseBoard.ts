import type { WeekStart } from '../history/stats';

/**
 * The Pulse board: which widgets show, in what order and size. Pure, with no
 * runtime imports, so `scripts/check-stats.mjs` can run it in plain Node.
 */

export type WidgetId =
  | 'recap'
  | 'mixes'
  | 'jump'
  | 'week'
  | 'goal'
  | 'streak'
  | 'artist'
  | 'hour'
  | 'repeat'
  | 'album'
  | 'session'
  | 'genre'
  | 'explore';
export type WidgetSize = 'square' | 'wide';
export type BoardItem = { id: WidgetId; on: boolean; size: WidgetSize };

/**
 * Home's sections, always in this order. Music to play sits open at the top;
 * the numbers are grouped by the time they cover, named once on the heading
 * instead of on every card. Customize moves widgets only within their group.
 */
export type WidgetGroup = 'music' | 'today' | 'month' | 'library';
export const GROUPS: { id: WidgetGroup; title: string | null }[] = [
  // Mixes and Jump back in carry their own shelf titles.
  { id: 'music', title: null },
  { id: 'today', title: 'Today & this week' },
  { id: 'month', title: 'Last 30 days' },
  { id: 'library', title: 'Your library' },
];

/** Default order. The first size is the default; one size means it can't change. */
export const WIDGETS: { id: WidgetId; name: string; group: WidgetGroup; note?: string; sizes: WidgetSize[] }[] = [
  { id: 'recap', name: 'Weekly recap', group: 'music', note: "On your week's start day", sizes: ['wide'] },
  { id: 'mixes', name: 'Mixes', group: 'music', sizes: ['wide'] },
  { id: 'jump', name: 'Jump back in', group: 'music', sizes: ['wide'] },
  { id: 'week', name: 'This week', group: 'today', sizes: ['wide'] },
  { id: 'goal', name: 'Daily goal', group: 'today', sizes: ['square'] },
  { id: 'streak', name: 'Streak', group: 'today', sizes: ['square'] },
  { id: 'artist', name: 'Top artist', group: 'month', sizes: ['square', 'wide'] },
  { id: 'hour', name: 'Peak hour', group: 'month', sizes: ['square', 'wide'] },
  { id: 'repeat', name: 'On repeat', group: 'month', sizes: ['wide', 'square'] },
  { id: 'album', name: 'Top album', group: 'month', sizes: ['square'] },
  { id: 'session', name: 'Longest session', group: 'month', sizes: ['square'] },
  { id: 'genre', name: 'Genre mix', group: 'month', sizes: ['square', 'wide'] },
  { id: 'explore', name: 'Explorer', group: 'library', sizes: ['square', 'wide'] },
];

export function groupOf(id: WidgetId): WidgetGroup {
  return WIDGETS.find((widget) => widget.id === id)?.group ?? 'month';
}

/** The board split into Home's sections, in section order, each keeping the saved order. */
export function groupBoard(board: BoardItem[]): { group: (typeof GROUPS)[number]; items: BoardItem[] }[] {
  return GROUPS.map((group) => ({ group, items: board.filter((item) => groupOf(item.id) === group.id) }));
}

export type PulseSettings = {
  board: BoardItem[];
  weekStart: WeekStart;
  /** Day key of the recap week last opened (its New dot goes). */
  recapSeen: string | null;
  /** Day key of the recap week opened with Show. Every other week's recap sits folded to a slim row. */
  recapOpen: string | null;
  /** Day key of the day the goal moment last played, so it plays once a day. */
  goalCelebrated: string | null;
};

export const DEFAULT_PULSE: PulseSettings = {
  board: WIDGETS.map((widget) => ({ id: widget.id, on: true, size: widget.sizes[0] })),
  weekStart: 6,
  recapSeen: null,
  recapOpen: null,
  goalCelebrated: null,
};

const WEEK_STARTS: WeekStart[] = [6, 0, 1];

/**
 * Keeps saved widgets that still exist, with a size they allow. Widgets added
 * in a later version slot in at their default place.
 */
export function parsePulse(value: unknown): PulseSettings | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as { board?: unknown; weekStart?: unknown; recapSeen?: unknown; recapOpen?: unknown; goalCelebrated?: unknown };
  const board: BoardItem[] = [];
  if (Array.isArray(saved.board)) {
    saved.board.forEach((entry) => {
      const widget = WIDGETS.find((candidate) => candidate.id === entry?.id);
      if (widget && !board.some((item) => item.id === widget.id)) {
        board.push({
          id: widget.id,
          on: entry.on !== false,
          size: widget.sizes.includes(entry.size) ? entry.size : widget.sizes[0],
        });
      }
    });
  }
  DEFAULT_PULSE.board.forEach((item, index) => {
    if (!board.some((existing) => existing.id === item.id)) {
      board.splice(Math.min(index, board.length), 0, { ...item });
    }
  });
  return {
    board,
    weekStart: WEEK_STARTS.includes(saved.weekStart as WeekStart) ? (saved.weekStart as WeekStart) : DEFAULT_PULSE.weekStart,
    recapSeen: typeof saved.recapSeen === 'string' ? saved.recapSeen : null,
    recapOpen: typeof saved.recapOpen === 'string' ? saved.recapOpen : null,
    goalCelebrated: typeof saved.goalCelebrated === 'string' ? saved.goalCelebrated : null,
  };
}

/**
 * Lays shown widgets into rows of one wide or two squares. A square with no
 * partner yet keeps its row open; the next square moves up beside it, so wide
 * widgets in between never leave a hole.
 */
export function packRows(board: BoardItem[]): BoardItem[][] {
  const rows: BoardItem[][] = [];
  let open: BoardItem[] | null = null;
  board.forEach((item) => {
    if (!item.on) {
      return;
    }
    if (item.size === 'wide') {
      rows.push([item]);
    } else if (open) {
      open.push(item);
      open = null;
    } else {
      open = [item];
      rows.push(open);
    }
  });
  return rows;
}
