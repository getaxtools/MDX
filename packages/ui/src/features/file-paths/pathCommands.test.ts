import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { commandForPathMenuItem, isPathMenuItem, pathMenuItems } from './pathCommands';

const translator = createTranslator();

describe('path commands', () => {
  it('offers to copy the path and to show the item in File Explorer', () => {
    expect(pathMenuItems(translator).map((item) => item.label)).toEqual([
      'Copy Path',
      'Reveal in File Explorer',
    ]);
  });

  it('cannot show a missing item in File Explorer', () => {
    const items = pathMenuItems(translator, { isAvailable: false });

    expect(items.filter((item) => item.isDisabled).map((item) => item.id)).toEqual(['revealInFileManager']);
  });

  it('turns a chosen item into a command for that path', () => {
    expect(commandForPathMenuItem('revealInFileManager', 'C:\\Docs\\a.md')).toEqual({
      kind: 'revealInFileManager',
      path: 'C:\\Docs\\a.md',
    });
  });

  it('recognizes only its own menu items', () => {
    expect(isPathMenuItem('copyPath')).toBe(true);
    expect(isPathMenuItem('close')).toBe(false);
  });
});
