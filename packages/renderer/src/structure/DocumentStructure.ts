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

export interface HtmlSegment {
  readonly kind: 'html';
  readonly range: SourceRange;
  readonly isInline: boolean;
}

export interface LinkSegment {
  readonly kind: 'link';
  readonly range: SourceRange;
  /** As written in the document, or in the reference definition the link uses. */
  readonly destination: string;
  /** The text a reader sees, without Markdown syntax. */
  readonly text: string;
  readonly hasImage: boolean;
  readonly isAutolink: boolean;
  readonly title?: string;
  readonly textRange?: SourceRange;
  readonly destinationRange?: SourceRange;
}

export interface ImageSegment {
  readonly kind: 'image';
  readonly range: SourceRange;
  readonly source: string;
  readonly alt: string;
  readonly title?: string;
  readonly sourceRange?: SourceRange;
}

export interface ReferenceDefinitionSegment {
  readonly kind: 'referenceDefinition';
  readonly range: SourceRange;
  readonly label: string;
  readonly destination: string;
  readonly title?: string;
  readonly isUsed: boolean;
}

export interface FrontMatterSegment {
  readonly kind: 'frontMatter';
  readonly range: SourceRange;
}

export type DocumentSegment =
  | CodeSpanSegment
  | CodeBlockSegment
  | MathSegment
  | HtmlSegment
  | LinkSegment
  | ImageSegment
  | ReferenceDefinitionSegment
  | FrontMatterSegment;

/** The parts of a Markdown document found by the parser without sanitizing anything, in document order. */
export interface DocumentStructure {
  readonly segments: readonly DocumentSegment[];
}
