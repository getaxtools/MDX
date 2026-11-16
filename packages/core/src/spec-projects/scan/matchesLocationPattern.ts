const ANY_DEPTH = '**';

function escapedForRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPart(patternPart: string, name: string): boolean {
  if (!patternPart.includes('*')) return patternPart.toLowerCase() === name.toLowerCase();
  // As in shell globs, `*` does not pick up hidden names such as `.git` or `.cache`.
  if (name.startsWith('.')) return false;
  const wildcard = new RegExp(`^${patternPart.split('*').map(escapedForRegExp).join('.*')}$`, 'i');
  return wildcard.test(name);
}

function matchesParts(patternParts: readonly string[], pathParts: readonly string[]): boolean {
  const [first, ...rest] = patternParts;
  if (first === undefined) return pathParts.length === 0;
  if (first === ANY_DEPTH) {
    if (rest.length === 0) return pathParts.length > 0;
    return pathParts.some((_, start) => matchesParts(rest, pathParts.slice(start)));
  }
  const [name, ...remaining] = pathParts;
  return name !== undefined && matchesPart(first, name) && matchesParts(rest, remaining);
}

/**
 * Whether a file path relative to a project matches a scan location: parts with `/` between them,
 * `*` inside a name and `**` for any folders, the same rules the project scan follows.
 */
export function matchesLocationPattern(pattern: string, relativePath: string): boolean {
  return matchesParts(pattern.split('/'), relativePath.split('/'));
}
