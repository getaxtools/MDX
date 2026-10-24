import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { headingIdInSourceView, scrollSourceLineToTop } from './sourceViewLines';

const LINE_HEIGHT_PX = 20;
const outline = [
  { level: 1, text: 'Guide', id: 'mdx-guide', line: 0 },
  { level: 2, text: 'Usage', id: 'mdx-usage', line: 4 },
];

/** jsdom has no layout for ranges, so each line start is placed by how many line breaks come before it. */
function layOutLinesFrom(sourceView: HTMLElement, viewTopPx: number) {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Range) {
      const before = document.createRange();
      before.setStart(sourceView, 0);
      before.setEnd(this.startContainer, this.startOffset);
      const lineIndex = before.toString().split('\n').length - 1;
      return DOMRect.fromRect({ y: viewTopPx + lineIndex * LINE_HEIGHT_PX, height: LINE_HEIGHT_PX });
    },
  });
}

function showSource(): { area: HTMLElement; sourceView: HTMLElement } {
  document.body.innerHTML = '<main><pre><code></code></pre></main>';
  const area = document.querySelector('main');
  const sourceView = document.querySelector('pre');
  const code = document.querySelector('code');
  if (!area || !sourceView || !code) throw new Error('layout missing');
  code.append('# Guide\n', document.createTextNode('\ntext\n\n'), '## Usage\nmore');
  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ y: 100, height: 400 }));
  return { area, sourceView };
}

describe('source view lines', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  });

  it('scrolls a line to the top of the reading area, across highlighted fragments', () => {
    const { area, sourceView } = showSource();
    layOutLinesFrom(sourceView, 100);
    area.scrollTop = 0;

    scrollSourceLineToTop(area, sourceView, 4);

    expect(area.scrollTop).toBe(4 * LINE_HEIGHT_PX);
  });

  it('ignores a line beyond the end of the text', () => {
    const { area, sourceView } = showSource();
    layOutLinesFrom(sourceView, 100);
    area.scrollTop = 7;

    scrollSourceLineToTop(area, sourceView, 99);

    expect(area.scrollTop).toBe(7);
  });

  it('names the heading whose line has reached the top of the reading area', () => {
    const { area, sourceView } = showSource();

    layOutLinesFrom(sourceView, 100);
    expect(headingIdInSourceView(area, sourceView, outline)).toBe('mdx-guide');

    layOutLinesFrom(sourceView, 100 - 4 * LINE_HEIGHT_PX);
    expect(headingIdInSourceView(area, sourceView, outline)).toBe('mdx-usage');
  });
});
