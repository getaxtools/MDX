import type { Env, MarkdownIt } from 'markdown-it';

export const HEADING_ID_PREFIX = 'mdx-';

export interface OutlineEntry {
  readonly level: number;
  readonly text: string;
  readonly id: string;
}

export type OutlineEnvironment = Env & { outline: OutlineEntry[] };

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
  return slug === '' ? 'section' : slug;
}

export function headingAnchorsPlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.push('mdx_heading_anchors', (state) => {
    const environment = state.env as OutlineEnvironment;
    const usedSlugCounts = new Map<string, number>();

    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;
      const inline = state.tokens[index + 1];
      const text = (inline?.children ?? [])
        .filter((child) => child.type === 'text' || child.type === 'code_inline')
        .map((child) => child.content)
        .join('');
      const id = uniqueId(slugify(text), usedSlugCounts);
      token.attrSet('id', id);
      environment.outline.push({ level: Number(token.tag.slice(1)), text, id });
    });
  });
}

function uniqueId(slug: string, usedSlugCounts: Map<string, number>): string {
  const timesUsed = usedSlugCounts.get(slug) ?? 0;
  usedSlugCounts.set(slug, timesUsed + 1);
  return timesUsed === 0 ? `${HEADING_ID_PREFIX}${slug}` : `${HEADING_ID_PREFIX}${slug}-${String(timesUsed)}`;
}
