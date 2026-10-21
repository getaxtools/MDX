import { describe, expect, it } from 'vitest';
import { lineForPreviewTop, previewTopForLine, readSourceLineAnchors } from './sourceLineScroll';

const ANCHORS = [
  { line: 0, top: 0 },
  { line: 10, top: 400 },
  { line: 20, top: 500 },
  { line: 40, top: 1500 },
];

describe('source line scrolling', () => {
  it('finds the preview position of a line that starts a block', () => {
    expect(previewTopForLine(ANCHORS, 10)).toBe(400);
  });

  it('places a line inside a block between the block and the next one', () => {
    expect(previewTopForLine(ANCHORS, 15)).toBe(450);
    expect(previewTopForLine(ANCHORS, 30)).toBe(1000);
  });

  it('stops at the end of the preview', () => {
    expect(previewTopForLine(ANCHORS, 99)).toBe(1500);
  });

  it('finds the line shown at a preview position', () => {
    expect(lineForPreviewTop(ANCHORS, 450)).toBe(15);
    expect(lineForPreviewTop(ANCHORS, 1000)).toBe(30);
    expect(lineForPreviewTop(ANCHORS, 5000)).toBe(40);
  });

  it('maps a line to the preview and back to the same line', () => {
    expect(lineForPreviewTop(ANCHORS, previewTopForLine(ANCHORS, 27.5))).toBeCloseTo(27.5);
  });

  it('starts at the top when there is nothing to map', () => {
    expect(previewTopForLine([], 12)).toBe(0);
    expect(lineForPreviewTop([], 300)).toBe(0);
  });

  it('reads marked blocks between the start and the end of the document', () => {
    const preview = document.createElement('div');
    preview.innerHTML = '<h1 data-mdx-source-line="0">A</h1><p data-mdx-source-line="2">B</p>';

    const anchors = readSourceLineAnchors(preview, 8);

    // A layout-free DOM puts every block at 0, so only the start survives as the first of equal tops.
    expect(anchors[0]).toEqual({ line: 0, top: 0 });
    expect(anchors.at(-1)?.line).toBe(8);
  });
});
