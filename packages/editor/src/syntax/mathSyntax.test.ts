import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { createMarkdownRenderer } from '@mdx/renderer';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { documentFixtures } from '../byte-exact/documentFixtures';
import { openDocumentBytes } from '../byte-exact/documentBytes';
import { markdownSyntax } from './markdownSyntax';

type MathKind = 'inline' | 'displayInLine' | 'displayBlock';

interface FoundMath {
  readonly kind: MathKind;
  readonly source: string;
}

const PARSE_TIMEOUT_MS = 5000;
/** The property parses and renders a hundred documents, which takes longer than one test usually may on a busy machine. */
const PROPERTY_TEST_TIMEOUT_MS = 30_000;
const MATH_NODES = new Set(['InlineMath', 'DisplayMath']);

/** The editor holds every line break as `
`, so positions in the tree are positions in its text. */
function parsedDocumentOf(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdownSyntax()] });
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
  if (!tree) throw new Error('The syntax tree did not finish');
  return { tree, textBetween: (from: number, to: number) => state.sliceDoc(from, to) };
}

function nodesNamed(doc: string, names: ReadonlySet<string>): { name: string; text: string }[] {
  const nodes: { name: string; text: string }[] = [];
  const { tree, textBetween } = parsedDocumentOf(doc);
  tree.iterate({
    enter: (node) => {
      if (names.has(node.name)) nodes.push({ name: node.name, text: textBetween(node.from, node.to) });
    },
  });
  return nodes;
}

function mathTextsOf(doc: string): string[] {
  return nodesNamed(doc, MATH_NODES).map((node) => node.text);
}

/** Math as the editor finds it, compared without whitespace and quote markers, which the preview drops. */
function editorMathOf(doc: string): FoundMath[] {
  const found: FoundMath[] = [];
  const { tree, textBetween } = parsedDocumentOf(doc);
  tree.iterate({
    enter: (node) => {
      if (!MATH_NODES.has(node.name)) return;
      const marks = node.node.getChildren('MathMark');
      const opening = marks[0];
      const closing = marks.at(-1);
      if (!opening || !closing) return;
      const isDisplayInLine = opening.to - opening.from === 2;
      found.push({
        kind: mathKind({ isBlock: node.name === 'DisplayMath', isDisplay: isDisplayInLine }),
        source: comparable(textBetween(opening.to, closing.from)),
      });
    },
  });
  return sorted(found);
}

const previewRenderer = createMarkdownRenderer({ window });

function previewMathOf(doc: string): FoundMath[] {
  const page = new DOMParser().parseFromString(previewRenderer.render(doc).html, 'text/html');
  const placeholders = [...page.querySelectorAll('.mdx-math-inline, .mdx-math-display')];
  return sorted(
    placeholders.map((placeholder) => ({
      kind: mathKind({
        isBlock: placeholder.tagName === 'DIV',
        isDisplay: placeholder.classList.contains('mdx-math-display'),
      }),
      source: comparable(placeholder.textContent),
    })),
  );
}

function mathKind({ isBlock, isDisplay }: { isBlock: boolean; isDisplay: boolean }): MathKind {
  if (isBlock) return 'displayBlock';
  return isDisplay ? 'displayInLine' : 'inline';
}

function comparable(source: string): string {
  return source.replace(/[\s>]/g, '');
}

function sorted(found: FoundMath[]): FoundMath[] {
  return found.toSorted((a, b) => `${a.kind} ${a.source}`.localeCompare(`${b.kind} ${b.source}`));
}

describe('math in the editor syntax tree', () => {
  it('finds inline math between single dollars', () => {
    expect(mathTextsOf('The area is $\\pi r^2$.')).toEqual(['$\\pi r^2$']);
  });

  it('dollar amounts are not math', () => {
    expect(mathTextsOf('It costs $5 and $10, or $ 3 $ with spaces.')).toEqual([]);
  });

  it('escaped dollar is not math', () => {
    expect(mathTextsOf('Pay \\$x$ now')).toEqual([]);
    expect(mathTextsOf('Keep $x\\$ open')).toEqual([]);
    expect(mathTextsOf('Here $a\\$b$ is math')).toEqual(['$a\\$b$']);
  });

  it('a closing dollar before a digit is not math', () => {
    expect(mathTextsOf('Between $x$5 and more')).toEqual([]);
  });

  it('display math spans lines', () => {
    const doc = 'Text\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAfter';

    expect(nodesNamed(doc, MATH_NODES)).toEqual([{ name: 'DisplayMath', text: '$$\n\\int_0^1 x\\,dx\n$$' }]);
  });

  it('display math interrupts a paragraph, like the preview', () => {
    expect(nodesNamed('Text\n$$\nx\n$$', MATH_NODES)).toEqual([{ name: 'DisplayMath', text: '$$\nx\n$$' }]);
  });

  it('two dollars with no closing line are text', () => {
    expect(mathTextsOf('Text\n\n$$\nx = 1\n\nAfter')).toEqual([]);
  });

  it('two dollars inside a line are display math in that line', () => {
    expect(nodesNamed('So $$x^2$$ here', MATH_NODES)).toEqual([{ name: 'InlineMath', text: '$$x^2$$' }]);
  });

  it('dollars in inline code are code', () => {
    const doc = 'Type `$x$` or `a $b$ c`.';

    expect(mathTextsOf(doc)).toEqual([]);
    expect(nodesNamed(doc, new Set(['InlineCode']))).toHaveLength(2);
  });

  it('display math inside a quote keeps the quote markers', () => {
    const doc = '> $$\n> x\n> $$\n';

    expect(nodesNamed(doc, new Set(['DisplayMath', 'QuoteMark'])).map((node) => node.name)).toEqual([
      'QuoteMark',
      'DisplayMath',
      'QuoteMark',
      'QuoteMark',
    ]);
  });

  it('display math in a quote closes only inside the quote', () => {
    expect(mathTextsOf('> $$\n> x\n\nAfter $$\n')).toEqual([]);
  });

  it('a quote line without its marker still closes display math, as in the preview', () => {
    expect(mathTextsOf('> $$\n> x\n$$\n')).toEqual(['$$\n> x\n$$']);
  });
});

describe('front matter in the editor syntax tree', () => {
  const FRONT_MATTER = new Set(['FrontMatter']);

  it('front matter only at the first line', () => {
    expect(nodesNamed('---\ntitle: Guide\n---\n\nText', FRONT_MATTER)).toEqual([
      { name: 'FrontMatter', text: '---\ntitle: Guide\n---' },
    ]);
    expect(nodesNamed('Intro\n\n---\ntitle: Guide\n---\n', FRONT_MATTER)).toEqual([]);
    expect(nodesNamed(' ---\ntitle: Guide\n---\n', FRONT_MATTER)).toEqual([]);
  });

  it('front matter closes with the fences the preview accepts', () => {
    expect(nodesNamed('---\ntitle: A\n...\nText', FRONT_MATTER)).toHaveLength(1);
    expect(nodesNamed('+++\ntitle = "A"\n+++\nText', FRONT_MATTER)).toHaveLength(1);
    expect(nodesNamed('+++\ntitle = "A"\n---\nText', FRONT_MATTER)).toEqual([]);
  });

  it('an opening fence without a closing one is not front matter', () => {
    expect(nodesNamed('---\ntitle: Guide\n\nText', FRONT_MATTER)).toEqual([]);
  });
});

describe('the editor and the preview', () => {
  it('the editor and the preview find the same math ranges in every document fixture', () => {
    const fixtures = documentFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      const { text } = openDocumentBytes(fixture.bytes);

      expect(editorMathOf(text), fixture.name).toEqual(previewMathOf(text));
    }
  });

  it(
    'the editor and the preview find the same math ranges in generated documents',
    { timeout: PROPERTY_TEST_TIMEOUT_MS },
    () => {
      const piece = fc.constantFrom(
        ...[
          '$',
          '$$',
          '$$\n',
          '  $$\n',
          '\\',
          '\\$',
          'x',
          '1',
          ' ',
          '\t',
          '\n',
          '\n\n',
          '`',
          '\n```\n',
          '{',
          '}',
        ],
        ...[
          '> ',
          '- ',
          '1. ',
          '# ',
          '    ',
          '---\n',
          '| a |',
          '|---|\n',
          '[a](b)',
          '*',
          '_',
          '<b>',
          '~~',
          '==',
        ],
      );

      fc.assert(
        fc.property(fc.array(piece, { maxLength: 40 }), (pieces) => {
          const doc = pieces.join('');

          expect(editorMathOf(doc)).toEqual(previewMathOf(doc));
        }),
      );
    },
  );
});
