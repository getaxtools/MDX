import type { MarkdownIt, Token } from 'markdown-it';
import { createMarkdownParser } from '../createMarkdownRenderer';
import { splitFrontMatter } from '../front-matter/splitFrontMatter';
import { ENGLISH_ALERT_TITLES } from '../plugins/alertsPlugin';
import type { DocumentSegment, DocumentStructure, SourceRange } from './DocumentStructure';
import { InlineSourceMap, type SourcePosition } from './InlineSourceMap';
import { SourceLines } from './SourceLines';
import {
  structureRecorderPlugin,
  type InlineRecord,
  type ReferenceRecord,
  type StructureEnvironment,
} from './structureRecorderPlugin';

interface CollectionContext {
  readonly lines: SourceLines;
  /** Lines of front matter above the parsed body. */
  readonly lineOffset: number;
  readonly environment: StructureEnvironment;
  readonly referenceDestinations: ReadonlyMap<string, string>;
}

const VISIBLE_TEXT_TOKENS = new Set(['text', 'code_inline', 'mdx_math_inline', 'emoji']);
const LINE_BREAK_TOKENS = new Set(['softbreak', 'hardbreak']);
const ANGLE_BRACKETS = /^<(.*)>$/s;
const DEFINITION_START = /^\s*\[(?:\\.|[^\\\]])+\]:\s*/;

let structureParser: MarkdownIt | undefined;

function parserForStructure(): MarkdownIt {
  structureParser ??= createMarkdownParser(ENGLISH_ALERT_TITLES).use(structureRecorderPlugin);
  return structureParser;
}

/**
 * Parses without sanitizing and lists the parts the prompt injection rules look at, with ranges in the
 * full text. Rendering and sanitizing would remove exactly the hidden content those rules must report.
 */
export function collectDocumentStructure(source: string): DocumentStructure {
  const { frontMatter, body } = splitFrontMatter(source);
  const lines = SourceLines.of(source);
  const lineOffset = lineCountOf(source) - lineCountOf(body);
  const environment: StructureEnvironment = { outline: [] };
  const tokens = parserForStructure().parse(body, environment);
  const references = environment.referenceRecords ?? [];
  const context = {
    lines,
    lineOffset,
    environment,
    referenceDestinations: referenceDestinationsOf(references, { lines, lineOffset }),
  };
  const contentSegments = segmentsOfTokens(tokens, context);
  const segments = [
    ...(frontMatter === undefined ? [] : [frontMatterSegment(lines, lineOffset)]),
    ...contentSegments,
    ...referenceSegments(references, context),
  ];
  return { segments: segments.sort((left, right) => left.range.from - right.range.from) };
}

function lineCountOf(text: string): number {
  return text.split(/\r?\n/).length;
}

function frontMatterSegment(lines: SourceLines, lineOffset: number): DocumentSegment {
  return { kind: 'frontMatter', range: lines.rangeOfLines(0, lineOffset) };
}

function blockRange(token: Token, context: CollectionContext): SourceRange {
  const [startLine = 0, endLine = startLine + 1] = token.map ?? [];
  return context.lines.rangeOfLines(startLine + context.lineOffset, endLine + context.lineOffset);
}

function blockSegmentOf(token: Token, context: CollectionContext): DocumentSegment | undefined {
  if (token.type === 'fence' || token.type === 'code_block') {
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    return { kind: 'codeBlock', range: blockRange(token, context), language };
  }
  if (token.type === 'html_block')
    return { kind: 'html', range: blockRange(token, context), isInline: false };
  if (token.type === 'mdx_math_block') return { kind: 'math', range: blockRange(token, context) };
  return undefined;
}

/** Table body cells have no line map of their own, so they take the line of the row they are in. */
function segmentsOfTokens(tokens: readonly Token[], context: CollectionContext): DocumentSegment[] {
  const segments: DocumentSegment[] = [];
  let cursor: SourcePosition = { line: -1, column: 0 };
  let currentLine = 0;
  for (const token of tokens) {
    currentLine = token.map?.[0] ?? currentLine;
    const blockSegment = blockSegmentOf(token, context);
    if (blockSegment) segments.push(blockSegment);
    if (token.type !== 'inline') continue;
    const inline = inlineSegments(token, { ...context, firstLine: currentLine + context.lineOffset }, cursor);
    segments.push(...inline.segments);
    cursor = inline.cursor;
  }
  return segments;
}

function inlineSegments(
  token: Token,
  context: CollectionContext & { readonly firstLine: number },
  cursor: SourcePosition,
): { segments: DocumentSegment[]; cursor: SourcePosition } {
  const { firstLine } = context;
  const sourceMap = InlineSourceMap.of({ content: token.content, firstLine }, context.lines, cursor);
  const records = token.children ? (context.environment.inlineRecords?.get(token.children) ?? []) : [];
  const segments = records.flatMap((record) =>
    segmentOfRecord(record, token.children ?? [], { sourceMap, context }),
  );
  const end = sourceMap.sourceOffsetOf(token.content.length);
  const endLine = firstLine + token.content.split('\n').length - 1;
  return { segments, cursor: { line: endLine, column: end - context.lines.lineStart(endLine) } };
}

function mappedRange(sourceMap: InlineSourceMap, from: number | undefined, to: number | undefined) {
  if (from === undefined || to === undefined) return undefined;
  return { from: sourceMap.sourceOffsetOf(from), to: sourceMap.sourceOffsetOf(to) };
}

function segmentOfRecord(
  record: InlineRecord,
  children: readonly Token[],
  { sourceMap, context }: { readonly sourceMap: InlineSourceMap; readonly context: CollectionContext },
): DocumentSegment[] {
  const range = { from: sourceMap.sourceOffsetOf(record.from), to: sourceMap.sourceOffsetOf(record.to) };
  switch (record.kind) {
    case 'codeSpan':
      return [{ kind: 'codeSpan', range }];
    case 'math':
      return [{ kind: 'math', range }];
    case 'html':
      return [{ kind: 'html', range, isInline: true }];
    case 'image':
      return record.token ? [imageSegment(record, record.token, { range, sourceMap, context })] : [];
    case 'link':
    case 'autolink':
      return record.token ? [linkSegment(record, record.token, { range, sourceMap, context, children })] : [];
  }
}

interface RecordPlacement {
  readonly range: SourceRange;
  readonly sourceMap: InlineSourceMap;
  readonly context: CollectionContext;
  readonly children?: readonly Token[];
}

function destinationOf(record: InlineRecord, token: Token, placement: RecordPlacement): string {
  const destinationRange = mappedRange(placement.sourceMap, record.destinationFrom, record.destinationTo);
  if (destinationRange) {
    const written = placement.context.lines.textBetween(destinationRange);
    return ANGLE_BRACKETS.exec(written)?.[1] ?? written;
  }
  const fromReference =
    record.referenceLabel === undefined
      ? undefined
      : placement.context.referenceDestinations.get(record.referenceLabel);
  return fromReference ?? stringAttribute(token, 'href') ?? stringAttribute(token, 'src') ?? '';
}

function stringAttribute(token: Token, name: string): string | undefined {
  const value = token.attrGet(name);
  return value === null ? undefined : String(value);
}

function linkSegment(record: InlineRecord, token: Token, placement: RecordPlacement): DocumentSegment {
  const linkChildren = childrenOfLink(placement.children ?? [], token);
  const title = stringAttribute(token, 'title');
  const textRange = mappedRange(placement.sourceMap, record.textFrom, record.textTo);
  const destinationRange = mappedRange(placement.sourceMap, record.destinationFrom, record.destinationTo);
  return {
    kind: 'link',
    range: placement.range,
    destination: destinationOf(record, token, placement),
    text: visibleTextOf(linkChildren),
    hasImage: linkChildren.some((child) => child.type === 'image'),
    isAutolink: record.kind === 'autolink',
    ...(title ? { title } : {}),
    ...(textRange ? { textRange } : {}),
    ...(destinationRange ? { destinationRange } : {}),
  };
}

function imageSegment(record: InlineRecord, token: Token, placement: RecordPlacement): DocumentSegment {
  const title = stringAttribute(token, 'title');
  const sourceRange = mappedRange(placement.sourceMap, record.destinationFrom, record.destinationTo);
  return {
    kind: 'image',
    range: placement.range,
    source: destinationOf(record, token, placement),
    alt: visibleTextOf(token.children ?? []),
    ...(title ? { title } : {}),
    ...(sourceRange ? { sourceRange } : {}),
  };
}

function childrenOfLink(children: readonly Token[], linkOpen: Token): Token[] {
  const start = children.indexOf(linkOpen);
  let depth = 0;
  for (let index = start + 1; index < children.length; index += 1) {
    const child = children[index];
    if (child?.type === 'link_open') depth += 1;
    if (child?.type === 'link_close' && depth-- === 0) return children.slice(start + 1, index);
  }
  return children.slice(start + 1);
}

function visibleTextOf(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      if (VISIBLE_TEXT_TOKENS.has(token.type)) return token.content;
      if (LINE_BREAK_TOKENS.has(token.type)) return ' ';
      return token.type === 'image' ? visibleTextOf(token.children ?? []) : '';
    })
    .join('');
}

function definitionDestination(definition: string): string {
  const afterLabel = DEFINITION_START.exec(definition)?.[0].length ?? 0;
  const written = /^\S+/.exec(definition.slice(afterLabel))?.[0] ?? '';
  return ANGLE_BRACKETS.exec(written)?.[1] ?? written;
}

function referenceDestinationsOf(
  references: readonly ReferenceRecord[],
  { lines, lineOffset }: { readonly lines: SourceLines; readonly lineOffset: number },
): ReadonlyMap<string, string> {
  const destinations = new Map<string, string>();
  for (const reference of references) {
    if (destinations.has(reference.label)) continue;
    const range = lines.rangeOfLines(reference.startLine + lineOffset, reference.endLine + lineOffset);
    destinations.set(reference.label, definitionDestination(lines.textBetween(range)));
  }
  return destinations;
}

function usedReferenceLabels(environment: StructureEnvironment): Set<string> {
  const labels = new Set<string>();
  for (const records of environment.inlineRecords?.values() ?? []) {
    for (const { referenceLabel, token } of records)
      if (referenceLabel !== undefined && token) labels.add(referenceLabel);
  }
  return labels;
}

/** A label used by a link marks only its first definition as used; markdown-it ignores later ones. */
function referenceSegments(
  references: readonly ReferenceRecord[],
  context: CollectionContext,
): DocumentSegment[] {
  const usedLabels = usedReferenceLabels(context.environment);
  const seenLabels = new Set<string>();
  return references.map((reference) => {
    const isFirstDefinition = !seenLabels.has(reference.label);
    seenLabels.add(reference.label);
    const title = context.environment.references?.[reference.label]?.title;
    return {
      kind: 'referenceDefinition',
      range: context.lines.rangeOfLines(
        reference.startLine + context.lineOffset,
        reference.endLine + context.lineOffset,
      ),
      label: reference.label,
      destination: context.referenceDestinations.get(reference.label) ?? '',
      ...(title ? { title } : {}),
      isUsed: isFirstDefinition && usedLabels.has(reference.label),
    };
  });
}
