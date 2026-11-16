const BYTE_ORDER_MARK = '\uFEFF';
const FENCE_OPENER = /^\s*(`{3,}|~{3,})(.*)/;
const FENCE_CLOSER = /^\s*(`{3,}|~{3,})\s*$/;
const CLOSING_HASHES = /[ \t]+#+[ \t]*$/;

interface OpenFence {
  readonly marker: string;
  readonly length: number;
}

/** The lines of a spec document, read as the spec tool reads them: no BOM, and CRLF or CR as one break. */
export function specLinesOf(text: string): string[] {
  const withoutMark = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  return withoutMark.replace(/\r\n?/g, '\n').split('\n');
}

function fenceOpenedBy(line: string): OpenFence | undefined {
  const match = FENCE_OPENER.exec(line);
  if (!match) return undefined;
  const run = match[1] ?? '';
  const infoString = match[2] ?? '';
  // A backtick fence's info string may not hold a backtick, so ```npm test``` is inline code.
  if (run.startsWith('`') && infoString.includes('`')) return undefined;
  return { marker: run.charAt(0), length: run.length };
}

function closesFence(line: string, fence: OpenFence): boolean {
  const run = FENCE_CLOSER.exec(line)?.[1] ?? '';
  return run.startsWith(fence.marker) && run.length >= fence.length;
}

/** For each line, whether it belongs to a fenced code block, the fence lines included. */
export function fencedLineMask(lines: readonly string[]): boolean[] {
  let openFence: OpenFence | undefined;
  return lines.map((line) => {
    if (openFence === undefined) {
      openFence = fenceOpenedBy(line);
      return openFence !== undefined;
    }
    if (closesFence(line, openFence)) openFence = undefined;
    return true;
  });
}

/** A heading title without its closing run of `#`, so `## Purpose ##` is the title `Purpose`. */
export function withoutClosingHashes(title: string): string {
  return title.replace(CLOSING_HASHES, '').trim();
}
