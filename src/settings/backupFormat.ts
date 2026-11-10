/**
 * The pure parts of backups (src/settings/backup.ts), with no runtime
 * imports so `scripts/check-stats.mjs` can test them.
 */

/**
 * A song's path below its storage volume (internal `/storage/emulated/0/`
 * or an SD card's `/storage/1A2B-3C4D/`): the same on a new phone when the
 * music was copied over as is.
 */
export const relativePath = (path: string) => path.replace(/^\/storage\/(?:emulated\/\d+|[^/]+)\//, '');

/** Non-ASCII characters as \u escapes. Inside JSON they only occur in strings, where escapes are valid. */
export const ascii = (json: string) =>
  json.replace(/[^\x00-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * The old phone's song id to this phone's, matched by path (`paths` holds
 * relative paths by old id). An id with no match that belongs to a different
 * song here becomes `gone:` so it never points at that song; any other
 * unmatched id is left as it is (the song may only be filtered out here).
 */
export function songIdMap(
  paths: Record<string, string> | undefined,
  tracks: readonly { id: string; path: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  if (!paths) {
    return map;
  }
  const byPath = new Map(tracks.map((track) => [relativePath(track.path), track.id]));
  const ids = new Set(tracks.map((track) => track.id));
  for (const [oldId, path] of Object.entries(paths)) {
    const id = byPath.get(path);
    if (id !== undefined) {
      if (id !== oldId) {
        map.set(oldId, id);
      }
    } else if (ids.has(oldId)) {
      map.set(oldId, `gone:${oldId}`);
    }
  }
  return map;
}

/**
 * Song ids in saved JSON, swapped in one pass so a swapped id is never
 * swapped again. shortcut: any JSON string equal to an old song id is
 * swapped, even one that is not an id; fine while ids are MediaStore numbers.
 */
export function swapSongIds(text: string, map: Map<string, string>): string {
  if (map.size === 0) {
    return text;
  }
  return text.replace(/"((?:[^"\\]|\\.)*)"/g, (whole, inner: string) => {
    const id = map.get(inner);
    return id === undefined ? whole : JSON.stringify(id);
  });
}
