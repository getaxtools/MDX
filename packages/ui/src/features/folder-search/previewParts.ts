import type { LineMatch } from '@mdx/platform';

export interface PreviewPart {
  readonly text: string;
  readonly isMatch: boolean;
}

/** The preview of a matching line, split so the matched text can be highlighted. */
export function previewParts({ preview, ranges }: LineMatch): PreviewPart[] {
  // The ranges count Unicode code points, as the search does on disk.
  const characters = Array.from(preview);
  const parts: PreviewPart[] = [];
  let position = 0;
  for (const [start, end] of [...ranges].sort(([first], [second]) => first - second)) {
    if (start < position || end > characters.length || start >= end) continue;
    if (start > position) parts.push({ text: characters.slice(position, start).join(''), isMatch: false });
    parts.push({ text: characters.slice(start, end).join(''), isMatch: true });
    position = end;
  }
  if (position < characters.length) parts.push({ text: characters.slice(position).join(''), isMatch: false });
  return parts;
}
