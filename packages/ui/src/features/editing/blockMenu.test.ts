import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { calloutTypeMenuItems, editorMenuItems } from './blockMenu';

const translator = createTranslator();

function labelsFor(calloutFold: '' | '+' | '-' | undefined): string[] {
  return editorMenuItems(translator, { isCaretInLink: false, calloutFold }).map((item) => item.label);
}

describe('block menu', () => {
  it('offers both starts for a callout that does not fold', () => {
    expect(labelsFor('')).toEqual(expect.arrayContaining(['Start collapsed', 'Start expanded']));
  });

  it('offers only the other start for a callout that folds', () => {
    const collapsed = labelsFor('-');
    const expanded = labelsFor('+');

    expect(collapsed).toContain('Start expanded');
    expect(collapsed).not.toContain('Start collapsed');
    expect(expanded).toContain('Start collapsed');
    expect(expanded).not.toContain('Start expanded');
  });

  it('offers no start for a block that is not a callout', () => {
    expect(labelsFor(undefined).some((label) => label.startsWith('Start '))).toBe(false);
  });

  it('the callout type menu names the five looks as the preview does', () => {
    expect(calloutTypeMenuItems(translator).map(({ id, label }) => [id, label])).toEqual([
      ['note', 'Note'],
      ['tip', 'Tip'],
      ['important', 'Important'],
      ['warning', 'Warning'],
      ['caution', 'Caution'],
    ]);
  });
});
