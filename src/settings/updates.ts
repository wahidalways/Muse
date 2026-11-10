/**
 * Settings › App & data › Check for updates. Asks GitHub for the latest
 * Muse release, only when tapped. Nothing about the listener is sent.
 */
const LATEST_RELEASE = 'https://api.github.com/repos/wahidalways/Muse/releases/latest';

export type UpdateCheck =
  | { status: 'latest' }
  | { status: 'available'; version: string; url: string; notes: string; publishedAt: string | null }
  | { status: 'none' }
  | { status: 'error' };

/** "v1.2.0" -> [1, 2, 0]. */
const parts = (version: string) =>
  version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);

/** True when `candidate` is a later version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
}

/** `currentVersion` is APP_VERSION; passed in so this file runs in node checks too. */
export async function checkForUpdate(currentVersion: string): Promise<UpdateCheck> {
  // A captive portal or a weak signal can hold a request open forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (response.status === 404) {
      // No release published yet.
      return { status: 'none' };
    }
    if (!response.ok) {
      return { status: 'error' };
    }
    const release = (await response.json()) as { tag_name?: string; html_url?: string; body?: string; published_at?: string };
    if (!release.tag_name) {
      return { status: 'none' };
    }
    return isNewer(release.tag_name, currentVersion)
      ? {
          status: 'available',
          version: release.tag_name.replace(/^v/i, ''),
          url: release.html_url ?? '',
          notes: releaseNotes(release.body ?? ''),
          publishedAt: release.published_at ?? null,
        }
      : { status: 'latest' };
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GitHub release notes (Markdown) as plain lines for the update sheet:
 * headings and emphasis dropped, links kept as their text, list items as
 * bullets, runs of blank lines folded. Long notes are cut at a line.
 */
export function releaseNotes(markdown: string, limit = 1200): string {
  const lines = markdown
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^\s*[-*+]\s+/, '• ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|__|`/g, '')
        .trimEnd(),
    )
    .filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''));
  let text = lines.join('\n').trim();
  if (text.length > limit) {
    const cut = text.lastIndexOf('\n', limit);
    text = `${text.slice(0, cut > 0 ? cut : limit).trimEnd()}\n…`;
  }
  return text;
}

