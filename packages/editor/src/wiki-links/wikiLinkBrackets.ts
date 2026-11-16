import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { VisibleRange } from '../rich-text/markupContext';
import { isTouchedBySelection } from '../rich-text/revealRule';
import { WIKI_LINK_TEXT_CLASS } from '../rich-text/richTextClasses';
import type { RichTextInlineProvider } from '../rich-text/richTextProviders';

/** The renderer's wiki-link rule: `[[`, text holding no bracket or line break, then `]]`. */
const WIKI_LINK = /\[\[([^[\]\n]+)\]\]/g;
const BRACKETS_LENGTH = 2;
/** Where the preview never makes a wiki-link: code, math, raw HTML and front matter. */
const NODES_WITHOUT_WIKI_LINKS = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'InlineMath',
  'DisplayMath',
  'HTMLBlock',
  'HTMLTag',
  'Comment',
  'FrontMatter',
]);

const HIDDEN_BRACKETS = Decoration.replace({});
const WIKI_LINK_TEXT = Decoration.mark({ class: WIKI_LINK_TEXT_CLASS });

function isWhereNoWikiLinkIs(state: EditorState, from: number): boolean {
  const innermost = syntaxTree(state).resolveInner(from, 1);
  if (innermost.name === 'Escape') return true;
  for (let node: typeof innermost | null = innermost; node; node = node.parent) {
    if (NODES_WITHOUT_WIKI_LINKS.has(node.name)) return true;
  }
  return false;
}

function wikiLinksOnLine(state: EditorState, lineNumber: number): { from: number; to: number }[] {
  const line = state.doc.line(lineNumber);
  return [...line.text.matchAll(WIKI_LINK)]
    .filter((match) => (match[1] ?? '').trim() !== '')
    .map((match) => ({ from: line.from + match.index, to: line.from + match.index + match[0].length }))
    .filter(({ from }) => !isWhereNoWikiLinkIs(state, from));
}

/**
 * In a note, `[[Name]]` shows as link text without its brackets while no selection touches the
 * link, so a caret anywhere in it, its edges included, shows all of its Markdown.
 */
export const WIKI_LINK_BRACKETS: RichTextInlineProvider = {
  decorate(state: EditorState, visible: VisibleRange): readonly Range<Decoration>[] {
    const decorations: Range<Decoration>[] = [];
    const lastLine = state.doc.lineAt(visible.to).number;
    for (let lineNumber = state.doc.lineAt(visible.from).number; lineNumber <= lastLine; lineNumber += 1) {
      for (const { from, to } of wikiLinksOnLine(state, lineNumber)) {
        if (from < visible.from || from > visible.to || isTouchedBySelection(state.selection, from, to))
          continue;
        decorations.push(
          HIDDEN_BRACKETS.range(from, from + BRACKETS_LENGTH),
          WIKI_LINK_TEXT.range(from + BRACKETS_LENGTH, to - BRACKETS_LENGTH),
          HIDDEN_BRACKETS.range(to - BRACKETS_LENGTH, to),
        );
      }
    }
    return decorations;
  },
};
