import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { Ruleset } from '../Ruleset';
import { analyzeHtml } from './analyzeHtml';

const STYLE_THRESHOLDS = { minFontSizePx: 2, offScreenOffsetPx: 999 };

/** Treats each tag or comment as its own HTML segment, as the parser does for inline HTML. */
function analyze(text: string, htmlParts: readonly string[]) {
  let searchFrom = 0;
  const segments: DocumentSegment[] = htmlParts.map((part) => {
    const from = text.indexOf(part, searchFrom);
    searchFrom = from + part.length;
    return { kind: 'html', range: { from, to: from + part.length }, isInline: true };
  });
  return analyzeHtml(text, { segments }, { ruleset: Ruleset.bundled(), styleThresholds: STYLE_THRESHOLDS });
}

function contentOf(text: string, range: { from: number; to: number } | undefined): string {
  return range ? text.slice(range.from, range.to) : '';
}

describe('analyzeHtml', () => {
  it('pairs tags across segments, so Markdown between them is hidden too', () => {
    const text = '<div hidden>\n\n**secret** words\n\n</div>';

    const [hidden] = analyze(text, ['<div hidden>', '</div>']).hiddenContents;

    expect(hidden).toMatchObject({
      reason: 'hiddenAttribute',
      tagName: 'div',
      element: { from: 0, to: text.length },
    });
    expect(contentOf(text, hidden?.content)).toBe('\n\n**secret** words\n\n');
  });

  it('finds styles, aria-hidden, invisible font colours and removed elements', () => {
    const text =
      '<span style="display:none">a</span><b aria-hidden="true">b</b><font color="#FFF">c</font><template>d</template>';

    const reasons = analyze(text, [text]).hiddenContents.map((hidden) => hidden.reason);

    expect(reasons).toEqual(['style', 'ariaHidden', 'fontColor', 'removedElement']);
  });

  it('finds a font colour equal to the background of an enclosing cell', () => {
    const text = '<td bgcolor="#336699"><font color="#369">x</font></td>';

    expect(analyze(text, [text]).hiddenContents.map((hidden) => hidden.reason)).toEqual(['fontColor']);
  });

  it('hides a collapsed section after its summary, but not an open one', () => {
    const text = '<details><summary>More</summary>inner</details><details open>shown</details>';

    const hidden = analyze(text, [text]).hiddenContents;

    expect(hidden.map((entry) => entry.reason)).toEqual(['collapsedDetails']);
    expect(contentOf(text, hidden[0]?.content)).toBe('inner');
  });

  it('closes elements left open inside a closing tag, and ignores a closing tag with no opener', () => {
    const text = '</p><div><span hidden>x</div>y';

    const [hidden] = analyze(text, [text]).hiddenContents;

    expect(contentOf(text, hidden?.content)).toBe('x');
  });

  it('hides an unclosed element up to the end of the document', () => {
    const text = '<span style="opacity:0">rest of the file';

    expect(contentOf(text, analyze(text, ['<span style="opacity:0">']).hiddenContents[0]?.content)).toBe(
      'rest of the file',
    );
  });

  it('lists comments, images, links and links whose unsafe address the sanitizer removes', () => {
    const text =
      '<!-- c --><img src="https://example.invalid/a.png" alt="A" title="T"><a href=" JavaScript:x">j</a>';

    const analysis = analyze(text, [text]);

    expect(analysis.comments).toMatchObject([{ content: ' c ' }]);
    expect(analysis.images).toMatchObject([{ url: 'https://example.invalid/a.png', alt: 'A', title: 'T' }]);
    expect(analysis.links).toMatchObject([{ url: ' JavaScript:x' }]);
    expect(analysis.unsafeLinks).toHaveLength(1);
  });

  it('never treats void elements as containers', () => {
    const text = '<br hidden>visible<img hidden src="x.png">visible';

    expect(analyze(text, [text]).hiddenContents).toEqual([]);
  });

  it('stays quick on thousands of unclosed tags and still finds hidden content inside them', () => {
    const text = `${'<div><font color="#123">'.repeat(20_000)}<span hidden>x</span>${'</p>'.repeat(20_000)}`;

    const startedAt = performance.now();
    const analysis = analyze(text, [text]);

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(analysis.hiddenContents.map((hidden) => hidden.reason)).toEqual(['hiddenAttribute']);
  });
});
