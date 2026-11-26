import type { Env, MarkdownIt, StateBlock, StateInline, Token } from 'markdown-it';

export type InlineRecordKind = 'link' | 'image' | 'codeSpan' | 'html' | 'math' | 'autolink';

/** Offsets are in the inline token's content, which the collector maps back to the document. */
export interface InlineRecord {
  readonly kind: InlineRecordKind;
  readonly from: number;
  readonly to: number;
  readonly token: Token | undefined;
  readonly textFrom?: number;
  readonly textTo?: number;
  readonly destinationFrom?: number;
  readonly destinationTo?: number;
  readonly referenceLabel?: string;
}

export interface ReferenceRecord {
  /** Lines of the parsed body, end exclusive. */
  readonly startLine: number;
  readonly endLine: number;
  readonly label: string;
}

export type StructureEnvironment = Env & {
  /** Records grouped by the children array of the inline token they were found in. */
  inlineRecords?: Map<Token[], InlineRecord[]>;
  referenceRecords?: ReferenceRecord[];
};

type InlineRule = (state: StateInline, silent: boolean) => boolean;
type BlockRuleArguments = [state: StateBlock, startLine: number, endLine: number, silent: boolean];
type BlockRule = (...args: BlockRuleArguments) => boolean;

const RECORDED_INLINE_RULES: readonly { rule: string; kind: InlineRecordKind; tokenType: string }[] = [
  { rule: 'link', kind: 'link', tokenType: 'link_open' },
  { rule: 'image', kind: 'image', tokenType: 'image' },
  { rule: 'backticks', kind: 'codeSpan', tokenType: 'code_inline' },
  { rule: 'html_inline', kind: 'html', tokenType: 'html_inline' },
  { rule: 'mdx_math_inline', kind: 'math', tokenType: 'mdx_math_inline' },
  { rule: 'autolink', kind: 'autolink', tokenType: 'link_open' },
  { rule: 'linkify', kind: 'autolink', tokenType: 'link_open' },
];
const REFERENCE_LABEL = /^\s*\[((?:\\.|[^\\\]])+)\]:/;
const OPENING_PARENTHESIS = '(';
const OPENING_BRACKET = '[';
const LINK_SPACE = /[ \t\n]/;

/**
 * markdown-it keeps no source positions for inline tokens, so each rule that makes a link, image,
 * code span, inline HTML or inline math is wrapped to note where it started and ended. The original
 * rules come from `Ruler.__rules__`: typed but internal, and the only way to reach them by name.
 */
export function structureRecorderPlugin(markdown: MarkdownIt): void {
  for (const { rule, kind, tokenType } of RECORDED_INLINE_RULES) {
    const original = markdown.inline.ruler.__rules__.find((entry) => entry.name === rule)?.fn;
    if (original) markdown.inline.ruler.at(rule, recordingInlineRule(original, kind, tokenType));
  }
  const reference = markdown.block.ruler.__rules__.find((entry) => entry.name === 'reference');
  if (reference) {
    markdown.block.ruler.at('reference', recordingReferenceRule(reference.fn), { alt: reference.alt });
  }
}

function recordingInlineRule(original: InlineRule, kind: InlineRecordKind, tokenType: string): InlineRule {
  return (state, silent) => {
    const start = state.pos;
    const pendingLength = state.pending.length;
    const firstToken = state.tokens.length;
    const isMatched = original(state, silent);
    if (!isMatched || silent) return isMatched;
    const newTokens = state.tokens.slice(firstToken);
    const from = start - schemeTakenFromPending(newTokens, pendingLength);
    const token = newTokens.find((candidate) => candidate.type === tokenType);
    addInlineRecord(state, { kind, from, to: state.pos, token, ...linkParts(state, kind, from) });
    return isMatched;
  };
}

/**
 * The linkify rule starts at the colon of `https:` and takes the scheme back from the text not yet
 * pushed, so the link starts that many characters earlier. Other rules leave the pending text alone.
 */
function schemeTakenFromPending(newTokens: readonly Token[], pendingLength: number): number {
  if (pendingLength === 0) return 0;
  const [first] = newTokens;
  const pushedPendingLength = first?.type === 'text' ? first.content.length : 0;
  return pendingLength - pushedPendingLength;
}

function addInlineRecord(state: StateInline, record: InlineRecord): void {
  const environment = state.env as StructureEnvironment;
  environment.inlineRecords ??= new Map();
  const records = environment.inlineRecords.get(state.tokens);
  if (records) records.push(record);
  else environment.inlineRecords.set(state.tokens, [record]);
}

type LinkParts = Pick<
  InlineRecord,
  'textFrom' | 'textTo' | 'destinationFrom' | 'destinationTo' | 'referenceLabel'
>;

function linkParts(state: StateInline, kind: InlineRecordKind, from: number): LinkParts {
  if (kind === 'autolink') return autolinkParts(state, from);
  if (kind !== 'link' && kind !== 'image') return {};
  const labelStart = kind === 'image' ? from + 1 : from;
  const labelEnd = state.md.helpers.parseLinkLabel(state, labelStart, kind === 'link');
  if (labelEnd < 0) return {};
  const text = { textFrom: labelStart + 1, textTo: labelEnd };
  if (state.src[labelEnd + 1] === OPENING_PARENTHESIS)
    return { ...text, ...destinationParts(state, labelEnd + 2) };
  return { ...text, referenceLabel: referenceLabelOf(state, labelStart, labelEnd) };
}

function autolinkParts(state: StateInline, from: number): LinkParts {
  const isBracketed = state.src[from] === '<';
  const textFrom = isBracketed ? from + 1 : from;
  const textTo = isBracketed ? state.pos - 1 : state.pos;
  return { textFrom, textTo, destinationFrom: textFrom, destinationTo: textTo };
}

function destinationParts(state: StateInline, afterParenthesis: number): LinkParts {
  let start = afterParenthesis;
  while (start < state.posMax && LINK_SPACE.test(state.src.charAt(start))) start += 1;
  const destination = state.md.helpers.parseLinkDestination(state.src, start, state.posMax);
  return destination.ok ? { destinationFrom: start, destinationTo: destination.pos } : {};
}

function referenceLabelOf(state: StateInline, labelStart: number, labelEnd: number): string {
  const ownLabel = state.src.slice(labelStart + 1, labelEnd);
  if (state.src[labelEnd + 1] !== OPENING_BRACKET) return state.md.utils.normalizeReference(ownLabel);
  const secondEnd = state.md.helpers.parseLinkLabel(state, labelEnd + 1);
  const secondLabel = secondEnd > labelEnd + 2 ? state.src.slice(labelEnd + 2, secondEnd) : ownLabel;
  return state.md.utils.normalizeReference(secondLabel);
}

function recordingReferenceRule(original: BlockRule): BlockRule {
  return (...[state, startLine, endLine, silent]: BlockRuleArguments) => {
    const isMatched = original(state, startLine, endLine, silent);
    if (!isMatched || silent) return isMatched;
    const definitionText = state.src.slice(state.bMarks[startLine] ?? 0, state.eMarks[state.line - 1]);
    const label = REFERENCE_LABEL.exec(definitionText)?.[1];
    if (label !== undefined) {
      const environment = state.env as StructureEnvironment;
      environment.referenceRecords ??= [];
      environment.referenceRecords.push({
        startLine,
        endLine: state.line,
        label: state.md.utils.normalizeReference(label),
      });
    }
    return isMatched;
  };
}
