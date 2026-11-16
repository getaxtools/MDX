import type { syntaxTree } from '@codemirror/language';
import { Decoration } from '@codemirror/view';
import { FormulaWidget, ImageWidget, RuleWidget } from './blockWidgets';
import { MAX_RENDERED_FORMULA_LENGTH } from './builtInBlockProviders';
import { hasLinkTarget, isBareUrl } from './linkTargets';
import { decorate, decorateLines, hide, isRevealed, type MarkupContext } from './markupContext';
import {
  HEADING_CLASS,
  HEADING_LEVELS,
  INLINE_CODE_CLASS,
  LINK_TEXT_CLASS,
  headingClassOf,
} from './richTextClasses';
import { richTextRenderingFacet } from './richTextRendering';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

export type NodeDecorator = (node: SyntaxNode, context: MarkupContext) => void;

const LINK_TEXT = Decoration.mark({ class: LINK_TEXT_CLASS });
const INLINE_CODE = Decoration.mark({ class: INLINE_CODE_CLASS });
const HEADING_LINES = HEADING_LEVELS.map((level) =>
  Decoration.line({ class: `${HEADING_CLASS} ${headingClassOf(level)}` }),
);
const LEADING_SPACE = /^[ \t]*/;
const TRAILING_SPACE = /[ \t]*$/;

export function headingLineOf(level: number): Decoration {
  return HEADING_LINES[level - 1] ?? Decoration.line({});
}

/** Emphasis, strong, strikethrough: the text keeps its style and the markers hide. */
export function hideMarksOf(markName: string): NodeDecorator {
  return (node, context) => {
    if (isRevealed(context, node.from, node.to)) return;
    for (const mark of node.getChildren(markName)) hide(context, mark.from, mark.to);
  };
}

const hideCodeMarks = hideMarksOf('CodeMark');

export function decorateInlineCode(node: SyntaxNode, context: MarkupContext): void {
  decorate(context, INLINE_CODE, node);
  hideCodeMarks(node, context);
}

/** `## Title ##`: the line at the heading's size, without its number signs and their spaces. */
export function atxHeadingDecorator(level: number): NodeDecorator {
  return (node, context) => {
    decorateLines(context, headingLineOf(level), node);
    if (isRevealed(context, node.from, node.to)) return;
    const [opening, closing] = node.getChildren('HeaderMark');
    if (!opening) return;
    const textStart = opening.to + spacesAfter(context, opening.to);
    hide(context, opening.from, textStart);
    if (!closing) return;
    hide(context, Math.max(closing.from - spacesBefore(context, closing.from), textStart), closing.to);
  };
}

function spacesAfter(context: MarkupContext, position: number): number {
  const line = context.state.doc.lineAt(position);
  return LEADING_SPACE.exec(context.state.sliceDoc(position, line.to))?.[0].length ?? 0;
}

function spacesBefore(context: MarkupContext, position: number): number {
  const line = context.state.doc.lineAt(position);
  return TRAILING_SPACE.exec(context.state.sliceDoc(line.from, position))?.[0].length ?? 0;
}

/** A heading underlined with `===` or `---`: its text lines at the heading's size; the block layer folds the underline away. */
export function setextHeadingDecorator(level: number): NodeDecorator {
  return (node, context) => {
    const underline = node.getChild('HeaderMark');
    const textEnd = underline ? Math.max(underline.from - 1, node.from) : node.to;
    decorateLines(context, headingLineOf(level), { from: node.from, to: textEnd });
  };
}

/** A picture with an address shows as the preview shows it. */
export function decorateImage(node: SyntaxNode, context: MarkupContext): void {
  const url = node.getChild('URL');
  if (!url || !hasRendering(context) || isRevealed(context, node.from, node.to)) return;
  const source = context.state.sliceDoc(node.from, node.to);
  const address = context.state.sliceDoc(url.from, url.to);
  decorate(context, Decoration.replace({ widget: new ImageWidget(source, address) }), node);
}

/** `$x^2$` shows typeset, unless it is longer than the preview typesets. */
export function decorateInlineMath(node: SyntaxNode, context: MarkupContext): void {
  const [opening, closing] = node.getChildren('MathMark');
  if (!opening || !closing || !hasRendering(context) || isRevealed(context, node.from, node.to)) return;
  const tex = context.state.sliceDoc(opening.to, closing.from);
  if (tex.length > MAX_RENDERED_FORMULA_LENGTH) return;
  const source = context.state.sliceDoc(node.from, node.to);
  decorate(context, Decoration.replace({ widget: new FormulaWidget(source, tex, false) }), node);
}

const RULE = Decoration.replace({ widget: new RuleWidget() });

export function decorateHorizontalRule(node: SyntaxNode, context: MarkupContext): void {
  if (!isRevealed(context, node.from, node.to)) decorate(context, RULE, node);
}

function hasRendering(context: MarkupContext): boolean {
  return context.state.facet(richTextRenderingFacet) !== undefined;
}

/** `[text](address)` and `[text][label]` show only the styled text. */
export function decorateLink(node: SyntaxNode, context: MarkupContext): void {
  const [opening, closing] = node.getChildren('LinkMark');
  if (!opening || !closing || !hasLinkTarget(node)) return;
  decorate(context, LINK_TEXT, { from: opening.to, to: closing.from });
  if (isRevealed(context, node.from, node.to)) return;
  hide(context, node.from, opening.to);
  hide(context, closing.from, node.to);
}

/** `<https://example.com>` shows the address as a link without its angle brackets. */
export function decorateAutolink(node: SyntaxNode, context: MarkupContext): void {
  const url = node.getChild('URL');
  if (!url) return;
  decorate(context, LINK_TEXT, url);
  if (isRevealed(context, node.from, node.to)) return;
  for (const mark of node.getChildren('LinkMark')) hide(context, mark.from, mark.to);
}

export function decorateBareUrl(node: SyntaxNode, context: MarkupContext): void {
  if (isBareUrl(node)) decorate(context, LINK_TEXT, node);
}

/** `\*` shows the character without its backslash. */
export function decorateEscape(node: SyntaxNode, context: MarkupContext): void {
  if (!isRevealed(context, node.from, node.to)) hide(context, node.from, node.from + 1);
}
