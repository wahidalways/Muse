/**
 * Asks GitHub for the latest Muse release: when Check for updates is tapped,
 * and once a day by itself (settings/updatePrompt.ts) unless turned off.
 * Nothing about the listener is sent.
 */
const LATEST_RELEASE = 'https://api.github.com/repos/wahidalways/Muse/releases/latest';
const RELEASE_BY_TAG = 'https://api.github.com/repos/wahidalways/Muse/releases/tags/';

type Release = {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  assets?: { name?: string; browser_download_url?: string; size?: number; digest?: string | null }[];
};

export type UpdateCheck =
  | { status: 'latest' }
  | {
      status: 'available';
      version: string;
      /** The release page. */
      url: string;
      /** The APK itself, which Muse downloads and installs; null when the release has none. */
      apkUrl: string | null;
      apkName: string | null;
      apkSize: number | null;
      /** GitHub's "sha256:..." fingerprint of the APK, checked before installing. */
      apkSha256: string | null;
      notes: string;
      publishedAt: string | null;
    }
  | { status: 'none' }
  | { status: 'error' };

/** "v1.2.0" -> [1, 2, 0]. */
const parts = (version: string) =>
  version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);

/** How a version is shown: "1.1.0" reads "1.1"; "1.0.1" stays as it is. */
export const shortVersion = (version: string) => version.replace(/^v/i, '').replace(/^(\d+\.\d+)\.0$/, '$1');

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
    const release = (await response.json()) as Release;
    if (!release.tag_name) {
      return { status: 'none' };
    }
    return isNewer(release.tag_name, currentVersion)
      ? {
          status: 'available',
          version: release.tag_name.replace(/^v/i, ''),
          url: release.html_url ?? '',
          ...apkOf(release),
          notes: releaseNotes(whatsNew(release.body ?? '')),
          publishedAt: release.published_at ?? null,
        }
      : { status: 'latest' };
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

function apkOf(release: Release) {
  const apk = release.assets?.find((asset) => asset.name?.toLowerCase().endsWith('.apk'));
  return {
    apkUrl: apk?.browser_download_url ?? null,
    apkName: apk?.name ?? null,
    apkSize: typeof apk?.size === 'number' ? apk.size : null,
    apkSha256: typeof apk?.digest === 'string' ? apk.digest : null,
  };
}

/**
 * Only the changes from a release's text: the install steps and license
 * lines after them ("**Install:** ...") are for the GitHub page, not the app.
 */
export function whatsNew(markdown: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const stop = lines.findIndex((line) => /^\s*(?:#+\s*)?(?:\*\*|__)?\s*install\b/i.test(line));
  return (stop === -1 ? lines : lines.slice(0, stop)).join('\n').trim();
}

/** What's new in one version (for the note after updating), or null when GitHub cannot be reached. */
export async function fetchReleaseNotes(version: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${RELEASE_BY_TAG}v${version}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const release = (await response.json()) as Release;
    return releaseNotes(whatsNew(release.body ?? '')) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GitHub release notes (Markdown) as plain lines for the update sheet:
 * headings kept as "## New" (the sheet groups changes under them), emphasis
 * dropped, links kept as their text, list items as bullets, runs of blank
 * lines folded. Long notes are cut at a line.
 */
export function releaseNotes(markdown: string, limit = 1200): string {
  const lines = markdown
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s*/, '## ')
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

