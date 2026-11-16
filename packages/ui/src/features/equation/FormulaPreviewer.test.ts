import type { FormulaPreview } from '@mdx/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormulaPreviewer, PREVIEW_DELAY_MS, type ShownFormulaPreview } from './FormulaPreviewer';

function fakePreview(tex: string): Promise<FormulaPreview> {
  return Promise.resolve(
    tex.endsWith('{')
      ? { kind: 'error', message: "Expected '}'", position: tex.length }
      : { kind: 'typeset', html: `<span>${tex}</span>` },
  );
}

describe('FormulaPreviewer', () => {
  let shown: ShownFormulaPreview[];
  let previewer: FormulaPreviewer;
  const previewFormula = vi.fn(fakePreview);

  beforeEach(() => {
    vi.useFakeTimers();
    shown = [];
    previewFormula.mockClear();
    previewer = new FormulaPreviewer(previewFormula, (preview) => shown.push(preview));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`typesets once, ${String(PREVIEW_DELAY_MS)} ms after typing stops`, async () => {
    previewer.request('x', false);
    previewer.request('x^', false);
    previewer.request('x^2', false);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS - 1);
    const typesetBeforeTheDelay = previewFormula.mock.calls.length;

    await vi.advanceTimersByTimeAsync(1);

    expect(typesetBeforeTheDelay).toBe(0);
    expect(previewFormula.mock.calls).toEqual([['x^2', false]]);
    expect(shown).toEqual([{ html: '<span>x^2</span>', problem: undefined }]);
  });

  it('keeps the last good result while the source fails', async () => {
    await previewer.renderNow('x', true);

    await previewer.renderNow('\\frac{1}{', true);

    expect(shown.at(-1)).toEqual({
      html: '<span>x</span>',
      problem: { kind: 'error', message: "Expected '}'", position: 9 },
    });
  });

  it('an empty source clears the preview without typesetting', async () => {
    await previewer.renderNow('x', false);

    await previewer.renderNow('  ', false);

    expect(shown.at(-1)).toEqual({ html: undefined, problem: undefined });
    expect(previewFormula).toHaveBeenCalledOnce();
  });

  it('shows nothing after it was stopped', async () => {
    previewer.request('x', false);

    previewer.stop();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);

    expect(shown).toEqual([]);
  });
});
