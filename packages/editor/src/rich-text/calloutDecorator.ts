import type { syntaxTree } from '@codemirror/language';
import { Decoration } from '@codemirror/view';
import { CalloutTitleWidget } from './blockWidgets';
import { decorate, decorateLines, isRevealed, type MarkupContext } from './markupContext';
import { CALLOUT_CLASS } from './richTextClasses';
import { richTextRenderingFacet, type CalloutPresentation } from './richTextRendering';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

/** The preview's callout marker: `[!type]`, an optional fold sign, then an optional title. */
const CALLOUT_MARKER = /^\[!([a-z][\w-]*)\][+-]?(?:[ \t]+(.*?))?[ \t]*$/i;
const QUOTE_MARKER_RUN = /^(?:[ \t]{0,3}>[ \t]?)+/;
const LOOK_NAME = /^[a-z]+$/;

interface CalloutLine {
  readonly markerFrom: number;
  readonly lineTo: number;
  readonly presentation: CalloutPresentation;
}

/** The callout a quote opens with, read from the text after the quote markers of its first line. */
function calloutOf(node: SyntaxNode, context: MarkupContext): CalloutLine | undefined {
  const { state } = context;
  const line = state.doc.lineAt(node.from);
  if (opensInnerQuote(node, context)) return undefined;
  const markers = QUOTE_MARKER_RUN.exec(line.text)?.[0] ?? '';
  const match = CALLOUT_MARKER.exec(line.text.slice(markers.length));
  const rendering = state.facet(richTextRenderingFacet);
  if (!match || !rendering) return undefined;
  const presentation = rendering.callout(match[1] ?? '', match[2] ?? '');
  if (!presentation || !LOOK_NAME.test(presentation.look)) return undefined;
  return { markerFrom: line.from + markers.length, lineTo: line.to, presentation };
}

/** A quote whose first line also opens a quote inside it leaves the callout to that inner quote. */
function opensInnerQuote(node: SyntaxNode, context: MarkupContext): boolean {
  const innerQuote = node.getChild('Blockquote');
  const { doc } = context.state;
  return innerQuote !== null && doc.lineAt(innerQuote.from).number === doc.lineAt(node.from).number;
}

/**
 * A callout keeps its body as editable quote lines with the preview's look for its type, and shows
 * its title in place of the `[!type]` marker while no selection touches the first line.
 */
export function decorateCallout(node: SyntaxNode, context: MarkupContext): boolean {
  const callout = calloutOf(node, context);
  if (!callout) return false;
  const look = Decoration.line({ class: `${CALLOUT_CLASS} ${CALLOUT_CLASS}-${callout.presentation.look}` });
  decorateLines(context, look, node);
  const firstLine = context.state.doc.lineAt(node.from);
  if (isRevealed(context, firstLine.from, firstLine.to)) return true;
  const title = Decoration.replace({ widget: new CalloutTitleWidget(callout.presentation.title) });
  decorate(context, title, { from: callout.markerFrom, to: callout.lineTo });
  return true;
}
