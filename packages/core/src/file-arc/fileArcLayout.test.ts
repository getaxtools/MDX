import { describe, expect, it } from 'vitest';
import { ARC_CARD_END_PX, MAX_NAMES_PER_SIDE, fileArcLayout } from './fileArcLayout';

const TALL = { areaWidth: 1200, areaHeight: 900, direction: 'ltr' } as const;

describe('fileArcLayout', () => {
  it('at most nine names are shown', () => {
    const layout = fileArcLayout({ ...TALL, listLength: 40, highlighted: 10 });

    expect(layout.names).toHaveLength(2 * MAX_NAMES_PER_SIDE);
    expect(layout.names.map((name) => name.index)).toEqual([6, 7, 8, 9, 11, 12, 13, 14]);
    expect(layout.card).toEqual({ left: ARC_CARD_END_PX, top: 0 });
  });

  it('names get smaller and fainter further from the card', () => {
    const layout = fileArcLayout({ ...TALL, listLength: 40, highlighted: 10 });
    const after = layout.names.filter((name) => name.distance > 0);

    const rounded = (values: readonly number[]) => values.map((value) => Math.round(value * 100) / 100);

    expect(rounded(after.map((name) => name.scale))).toEqual([0.94, 0.88, 0.82, 0.76]);
    expect(rounded(after.map((name) => name.opacity))).toEqual([0.95, 0.9, 0.85, 0.8]);
  });

  it('a short window shows fewer names', () => {
    const layout = fileArcLayout({ ...TALL, areaHeight: 480, listLength: 40, highlighted: 10 });
    const lowest = Math.max(...layout.names.map((name) => name.top));

    expect(layout.names.length).toBeLessThan(2 * MAX_NAMES_PER_SIDE);
    expect(layout.names.filter((name) => name.distance === -1)).toHaveLength(1);
    expect(layout.names.filter((name) => name.distance === 1)).toHaveLength(1);
    expect(lowest).toBeLessThan(480 / 2 - 64);
  });

  it('names stay at least 44 pixels apart in a very short window', () => {
    const layout = fileArcLayout({ ...TALL, areaHeight: 300, listLength: 40, highlighted: 0 });
    const next = layout.names.find((name) => name.distance === 1);

    expect(next?.top).toBeGreaterThanOrEqual(43);
  });

  it('the list wraps around the highlight', () => {
    const layout = fileArcLayout({ ...TALL, listLength: 12, highlighted: 0 });

    expect(layout.names.map((name) => name.index)).toEqual([8, 9, 10, 11, 1, 2, 3, 4]);
  });

  it('a short list shows each entry once', () => {
    const layout = fileArcLayout({ ...TALL, listLength: 3, highlighted: 1 });

    expect(layout.names.map((name) => name.index)).toEqual([0, 2]);
    expect(layout.dots).toHaveLength(3);
  });

  it('the arc mirrors in right-to-left layouts', () => {
    const ltr = fileArcLayout({ ...TALL, listLength: 12, highlighted: 3 });
    const rtl = fileArcLayout({ ...TALL, direction: 'rtl', listLength: 12, highlighted: 3 });

    expect(rtl.card.left).toBe(TALL.areaWidth - ltr.card.left);
    expect(rtl.names.map((name) => name.left)).toEqual(ltr.names.map((name) => TALL.areaWidth - name.left));
    expect(rtl.dial.centreLeft).toBe(TALL.areaWidth - ltr.dial.centreLeft);
  });

  it('only shown entries are laid out for a list of 10,000', () => {
    const layout = fileArcLayout({ ...TALL, listLength: 10_000, highlighted: 9_999 });

    expect(layout.names.length).toBeLessThanOrEqual(2 * MAX_NAMES_PER_SIDE);
    expect(layout.dots.length).toBeLessThanOrEqual(2 * MAX_NAMES_PER_SIDE + 1);
    expect(layout.names.map((name) => name.index)).toContain(0);
  });

  it('marks the highlighted position with the middle dot', () => {
    const layout = fileArcLayout({ ...TALL, listLength: 12, highlighted: 5 });
    const here = layout.dots.find((dot) => dot.distance === 0);

    expect(here).toMatchObject({ index: 5, top: 0, opacity: 1 });
  });
});
