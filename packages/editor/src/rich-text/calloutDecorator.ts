import { Decoration } from '@codemirror/view';
import { calloutFoldRangeOf, isCalloutFolded } from './calloutFolds';
import { calloutLineAt, type CalloutLine } from './calloutMarker';
import { CalloutTitleWidget } from './calloutTitleWidget';
import { decorate, decorateLines, isRevealed, type MarkupContext } from './markupContext';
import { CALLOUT_CLASS } from './richTextClasses';
import { richTextRenderingFacet, type CalloutPresentation } from './richTextRendering';
import type { SyntaxNode } from '../syntax/syntaxNode';

const LOOK_NAME = /^[a-z]+$/;

interface ShownCallout {
  readonly line: CalloutLine;
  readonly presentation: CalloutPresentation;
}

/** The callout a quote opens with, read from the text after the quote markers of its first line. */
function calloutOf(node: SyntaxNode, context: MarkupContext): ShownCallout | undefined {
  const { state } = context;
  if (opensInnerQuote(node, context)) return undefined;
  const line = calloutLineAt(state, node.from);
  const rendering = state.facet(richTextRenderingFacet);
  if (!line || !rendering) return undefined;
  const presentation = rendering.callout(line.type, line.title);
  if (!presentation || !LOOK_NAME.test(presentation.look)) return undefined;
  return { line, presentation };
}

/** A quote whose first line also opens a quote inside it leaves the callout to that inner quote. */
function opensInnerQuote(node: SyntaxNode, context: MarkupContext): boolean {
  const innerQuote = node.getChild('Blockquote');
  const { doc } = context.state;
  return innerQuote !== null && doc.lineAt(innerQuote.from).number === doc.lineAt(node.from).number;
}

function titleWidgetOf(node: SyntaxNode, context: MarkupContext, { line, presentation }: ShownCallout) {
  const range = line.foldSign === '' ? undefined : calloutFoldRangeOf(context.state, node);
  return new CalloutTitleWidget({
    title: presentation.title,
    typeRange: { from: line.typeFrom, to: line.typeTo },
    fold: range ? { range, isCollapsed: isCalloutFolded(context.state, range) } : undefined,
  });
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
  const title = Decoration.replace({ widget: titleWidgetOf(node, context, callout) });
  decorate(context, title, { from: callout.line.markerFrom, to: callout.line.lineTo });
  return true;
}
