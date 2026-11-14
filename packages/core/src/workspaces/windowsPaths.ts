import type { DocumentLocation } from '@mdx/platform';

const DRIVE_ROOT = /^[a-z]:$/i;
const UNC_PREFIX = '\\\\';

interface SplitPath {
  /** `C:` or `\\server\share`, compared without regard to case. */
  readonly root: string;
  readonly segments: readonly string[];
}

/** Splits an absolute Windows path into its drive or share and its folders; undefined when it is relative. */
function splitAbsolutePath(path: string): SplitPath | undefined {
  const normalized = path.replaceAll('/', '\\');
  if (normalized.startsWith(UNC_PREFIX)) {
    const [server, share, ...segments] = normalized.slice(UNC_PREFIX.length).split('\\');
    if (!server || !share) return undefined;
    return { root: `${UNC_PREFIX}${server}\\${share}`, segments: segments.filter(Boolean) };
  }
  const [drive, ...segments] = normalized.split('\\');
  if (drive === undefined || !DRIVE_ROOT.test(drive)) return undefined;
  return { root: drive.toUpperCase(), segments: segments.filter(Boolean) };
}

export function isAbsoluteWindowsPath(path: string): boolean {
  return splitAbsolutePath(path) !== undefined;
}

/**
 * The path as seen from a folder, with forward slashes, when both are on the same drive or share; undefined
 * when they are not, since a relative path cannot cross drives.
 */
export function relativePathFrom(folder: string, path: string): string | undefined {
  const from = splitAbsolutePath(folder);
  const to = splitAbsolutePath(path);
  if (!from || to?.root.toLowerCase() !== from.root.toLowerCase()) return undefined;
  let common = 0;
  while (
    common < from.segments.length &&
    common < to.segments.length &&
    from.segments[common]?.toLowerCase() === to.segments[common]?.toLowerCase()
  ) {
    common += 1;
  }
  const upward = from.segments.slice(common).map(() => '..');
  const relative = [...upward, ...to.segments.slice(common)].join('/');
  return relative === '' ? '.' : relative;
}

/** Resolves a written path against a folder; an absolute path is kept, with backslashes. */
export function resolvePathFrom(folder: string, written: string): string | undefined {
  const absolute = splitAbsolutePath(written);
  if (absolute) return joinPath(absolute.root, absolute.segments);
  const base = splitAbsolutePath(folder);
  if (!base) return undefined;
  const segments = [...base.segments];
  for (const segment of written.replaceAll('\\', '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return joinPath(base.root, segments);
}

function joinPath(root: string, segments: readonly string[]): string {
  return segments.length === 0 ? `${root}\\` : `${root}\\${segments.join('\\')}`;
}

/** A location for a path that was not opened yet, keyed as the desktop app keys Windows paths. */
export function locationOfPath(path: string): DocumentLocation {
  const fileName = path.split('\\').filter(Boolean).at(-1) ?? path;
  return { canonicalKey: path.toLowerCase(), displayPath: path, fileName };
}
