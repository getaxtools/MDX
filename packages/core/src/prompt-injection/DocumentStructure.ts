/** A half-open range of UTF-16 offsets in the document text. */
export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface CodeSpanSegment {
  readonly kind: 'codeSpan';
  readonly range: SourceRange;
}

export interface CodeBlockSegment {
  readonly kind: 'codeBlock';
  readonly range: SourceRange;
  /** The info string's first word, lower case; empty for indented code and bare fences. */
  readonly language: string;
}

export interface MathSegment {
  readonly kind: 'math';
  readonly range: SourceRange;
}

export interface LinkSegment {
  readonly kind: 'link';
  readonly range: SourceRange;
  readonly destination: string;
  readonly textRange?: SourceRange;
  readonly destinationRange?: SourceRange;
}

export interface ImageSegment {
  readonly kind: 'image';
  readonly range: SourceRange;
  readonly source: string;
  readonly sourceRange?: SourceRange;
}

export type DocumentSegment = CodeSpanSegment | CodeBlockSegment | MathSegment | LinkSegment | ImageSegment;

/** The parts of a Markdown document the rules need, found by a parser without sanitizing anything. */
export interface DocumentStructure {
  readonly segments: readonly DocumentSegment[];
}

export const EMPTY_DOCUMENT_STRUCTURE: DocumentStructure = { segments: [] };
