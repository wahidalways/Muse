/** One lyrics line; `time` is its start in seconds when the lyrics are synced. */
export type LyricsLine = { time: number | null; text: string };

export type Lyrics = {
  /** True when every line has a time ("LRC" lyrics), so the player can follow along. */
  synced: boolean;
  lines: LyricsLine[];
};

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** LRC header tags such as [ar:Artist] or [length:3:20]: not lyrics. */
const HEADER_TAG = /^\[[a-z#]+:[^\]]*\]$/i;

/**
 * Reads lyrics saved in a song file. Time-stamped lines ("[01:23.45]Hello",
 * several stamps allowed per line) become synced lyrics, sorted by time;
 * anything else is plain text, one entry per line.
 */
export function parseLyrics(text: string): Lyrics {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const timed: { time: number; text: string }[] = [];
  let hasStamps = false;
  rawLines.forEach((raw) => {
    const line = raw.trim();
    if (HEADER_TAG.test(line)) {
      return;
    }
    const stamps = [...line.matchAll(TIMESTAMP)];
    if (stamps.length === 0) {
      return;
    }
    hasStamps = true;
    const words = line.replace(TIMESTAMP, '').trim();
    stamps.forEach((stamp) => {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      timed.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text: words });
    });
  });
  if (hasStamps) {
    timed.sort((a, b) => a.time - b.time);
    return { synced: true, lines: timed };
  }
  // Plain lyrics: keep single blank lines between verses, drop runs of them.
  const lines: LyricsLine[] = [];
  rawLines.forEach((raw) => {
    const line = raw.trim();
    if (line.length > 0 || (lines.length > 0 && lines[lines.length - 1].text.length > 0)) {
      lines.push({ time: null, text: line });
    }
  });
  while (lines.length > 0 && lines[lines.length - 1].text.length === 0) {
    lines.pop();
  }
  return { synced: false, lines };
}

/** The line playing at `seconds`: the last one that has started, or -1 before the first. */
export function activeLyricsLine(lines: LyricsLine[], seconds: number): number {
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const time = lines[index].time;
    if (time === null || time > seconds) {
      break;
    }
    active = index;
  }
  return active;
}
