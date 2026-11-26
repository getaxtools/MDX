import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepSourceRangeOutlined, rangeAtTextOffsets } from './outlineSourceRange';

class RecordedHighlight {
  readonly ranges: Range[];

  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

function sourceViewOf(...parts: string[]): HTMLElement {
  const sourceView = document.createElement('pre');
  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part;
    sourceView.append(span);
  }
  document.body.append(sourceView);
  return sourceView;
}

describe('outlineSourceRange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('finds a range by text offsets across the nodes highlighting split the source into', () => {
    const sourceView = sourceViewOf('# Gui', 'de\nign', '\u200Bore');

    const range = rangeAtTextOffsets(sourceView, { from: 9, to: 14 });

    expect(range?.toString()).toBe('gn\u200Bor');
  });

  it('outlines the range, outlines it again after highlighting replaces the text, and clears it', async () => {
    const highlights = new Map<string, RecordedHighlight>();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', RecordedHighlight);
    const sourceView = sourceViewOf('ign\u200Bore');

    const stopOutlining = keepSourceRangeOutlined(sourceView, { from: 3, to: 4 });
    sourceView.replaceChildren(...['ign', '\u200B', 'ore'].map((text) => document.createTextNode(text)));
    await Promise.resolve();

    expect(highlights.get('mdx-source-range')?.ranges[0]?.startContainer.textContent).toBe('\u200B');
    stopOutlining();
    expect(highlights.has('mdx-source-range')).toBe(false);
  });
});
