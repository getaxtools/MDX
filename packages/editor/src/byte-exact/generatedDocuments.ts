import fc from 'fast-check';

/** Markdown that a save must give back unchanged, including the forms a rewrite would normalize. */
const MARKDOWN_PIECES = [
  '# An ATX heading',
  'A setext heading\n================',
  'A second level\n--------------',
  'Both emphasis markers: *stars* and _underscores_, **strong** and __strong__.',
  '1. first\n2. second',
  '1) first\n2) second',
  '- [ ] an open task\n- [x] a done task',
  '| A | B |\n|---|:-:|\n| 1 | 2 |',
  'Inline $x^2$ next to a price of $5.',
  '$$\n\\int_0^1 x\\,dx\n$$',
  '<div class="note">\n\nAn HTML *block*.\n\n</div>',
  'A [reference link][ref].\n\n[ref]: https://example.com/page "Title"',
  '\tcode indented with a tab\n\tand\ta second line',
  'Trailing spaces   ',
  'A hard break  \nand the next line',
  'Decomposed letters: café and naïve.',
  'Right to left: مرحبا and שלום.',
  'Joined emoji: \u{1F468}‍\u{1F469}‍\u{1F467}',
  '> A quote\n> on two lines',
  '```js\nconst answer = 42;\n```',
];
const FRONT_MATTER = '---\ntitle: Generated\ntags: [sample]\n---';
const BYTE_ORDER_MARK = '﻿';
const MAX_PIECES = 8;

type LineBreakStyle = 'lf' | 'crlf' | 'mixed';

interface DocumentShape {
  readonly hasByteOrderMark: boolean;
  readonly hasFrontMatter: boolean;
  readonly pieces: readonly string[];
  readonly lineBreakStyle: LineBreakStyle;
  /** For mixed line breaks, whether each line break is CRLF, used in turn. */
  readonly windowsBreaks: readonly boolean[];
  readonly hasFinalLineBreak: boolean;
}

/** UTF-8 documents built from Markdown pieces, joined with LF, CRLF or both, with or without a byte order mark. */
export function generatedDocumentBytes(): fc.Arbitrary<Uint8Array> {
  return fc
    .record({
      hasByteOrderMark: fc.boolean(),
      hasFrontMatter: fc.boolean(),
      pieces: fc.array(fc.constantFrom(...MARKDOWN_PIECES), { minLength: 1, maxLength: MAX_PIECES }),
      lineBreakStyle: fc.constantFrom<LineBreakStyle>('lf', 'crlf', 'mixed'),
      windowsBreaks: fc.array(fc.boolean(), { minLength: 1 }),
      hasFinalLineBreak: fc.boolean(),
    })
    .map((shape) => new TextEncoder().encode(documentTextOf(shape)));
}

function documentTextOf(shape: DocumentShape): string {
  const blocks = shape.hasFrontMatter ? [FRONT_MATTER, ...shape.pieces] : shape.pieces;
  const lines = blocks.join('\n\n').split('\n');
  const text = lines
    .map((line, index) => (index === 0 ? line : `${lineBreakBefore(shape, index)}${line}`))
    .join('');
  const ending = shape.hasFinalLineBreak ? lineBreakBefore(shape, lines.length) : '';
  return `${shape.hasByteOrderMark ? BYTE_ORDER_MARK : ''}${text}${ending}`;
}

function lineBreakBefore(shape: DocumentShape, lineIndex: number): string {
  if (shape.lineBreakStyle === 'lf') return '\n';
  if (shape.lineBreakStyle === 'crlf') return '\r\n';
  const isWindowsBreak = shape.windowsBreaks[lineIndex % shape.windowsBreaks.length] ?? false;
  return isWindowsBreak ? '\r\n' : '\n';
}
