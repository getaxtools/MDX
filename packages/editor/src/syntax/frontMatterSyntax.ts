import { tags } from '@lezer/highlight';
import type { BlockContext, Line, MarkdownConfig } from './markdownParserTypes';
import { linesAfter, type DocumentLine } from './readingAhead';

/** The fences the preview accepts: YAML between `---` (closed by `---` or `...`), TOML between `+++`. */
const FRONT_MATTER_FENCES = [
  { opening: '---', closings: ['---', '...'] },
  { opening: '+++', closings: ['+++'] },
];

/** Front matter as the preview finds it: fenced lines from the very first line, each fence a `FrontMatterMark`. */
export const FRONT_MATTER_SYNTAX: MarkdownConfig = {
  defineNodes: [
    { name: 'FrontMatter', block: true },
    { name: 'FrontMatterMark', style: tags.processingInstruction },
  ],
  parseBlock: [{ name: 'FrontMatter', parse: parseFrontMatter, before: 'HorizontalRule' }],
};

function parseFrontMatter(context: BlockContext, line: Line): boolean {
  const isFirstLineOfDocument = context.lineStart === 0 && context.depth === 1;
  if (!isFirstLineOfDocument) return false;
  const fence = FRONT_MATTER_FENCES.find(({ opening }) => line.text.trimEnd() === opening);
  if (!fence) return false;
  const closing = closingFenceAfter(context, line, fence.closings);
  if (!closing) return false;
  const marks = [
    context.elt('FrontMatterMark', 0, fence.opening.length),
    context.elt('FrontMatterMark', closing.from, closing.from + closing.text.trimEnd().length),
  ];
  while (context.lineStart < closing.from && context.nextLine());
  const end = context.lineStart + line.text.length;
  context.nextLine();
  context.addElement(context.elt('FrontMatter', 0, end, marks));
  return true;
}

function closingFenceAfter(
  context: BlockContext,
  line: Line,
  closings: readonly string[],
): DocumentLine | undefined {
  for (const next of linesAfter(context, line)) {
    if (closings.includes(next.text.trimEnd())) return next;
  }
  return undefined;
}
