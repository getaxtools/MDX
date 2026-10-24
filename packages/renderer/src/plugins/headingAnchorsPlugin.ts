import type { Env, MarkdownIt, Token } from 'markdown-it';

export const HEADING_ID_PREFIX = 'mdx-';

export interface OutlineEntry {
  readonly level: number;
  readonly text: string;
  readonly id: string;
  /** The zero-based line of the full document, front matter included, where the heading starts. */
  readonly line: number;
}

export type OutlineEnvironment = Env & {
  outline: OutlineEntry[];
  /** Lines of front matter hidden before the parsed body. */
  outlineLineOffset?: number;
};

const SLUG_TOKEN_TYPES = new Set(['text', 'code_inline']);
const LABEL_TOKEN_TYPES = new Set(['text', 'code_inline', 'emoji', 'mdx_math_inline']);

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
  return slug === '' ? 'section' : slug;
}

export function headingAnchorsPlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.push('mdx_heading_anchors', (state) => {
    const environment = state.env as OutlineEnvironment;
    const issuedIds = new Set<string>();

    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;
      const children = state.tokens[index + 1]?.children ?? [];
      const id = unusedId(`${HEADING_ID_PREFIX}${slugify(textOf(children, SLUG_TOKEN_TYPES))}`, issuedIds);
      token.attrSet('id', id);
      environment.outline.push({
        level: Number(token.tag.slice(1)),
        text: textOf(children, LABEL_TOKEN_TYPES).replace(/\s+/g, ' ').trim(),
        id,
        line: (token.map?.[0] ?? 0) + (environment.outlineLineOffset ?? 0),
      });
    });
  });
}

function textOf(children: readonly Token[], tokenTypes: ReadonlySet<string>): string {
  return children
    .filter((child) => tokenTypes.has(child.type))
    .map((child) => child.content)
    .join('');
}

/** GitHub's rule: add -1, -2… until the id is not taken, so "Intro", "Intro", "Intro 1" stay distinct. */
function unusedId(baseId: string, issuedIds: Set<string>): string {
  let id = baseId;
  for (let suffix = 1; issuedIds.has(id); suffix += 1) id = `${baseId}-${String(suffix)}`;
  issuedIds.add(id);
  return id;
}
