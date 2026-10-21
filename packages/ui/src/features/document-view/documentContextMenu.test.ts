import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import {
  commandForDocumentMenuItem,
  documentContextMenuItems,
  type DocumentMenuState,
} from './documentContextMenu';

const translator = createTranslator();
const previewState: DocumentMenuState = {
  hasSelection: true,
  isSourceView: false,
  isOutlineVisible: true,
  isFavourite: false,
  canBeFavourite: true,
};

describe('document context menu', () => {
  it('offers the document actions with their shortcuts', () => {
    const items = documentContextMenuItems(previewState, translator);

    expect(items.map((item) => [item.label, item.shortcut])).toEqual([
      ['Copy', 'Ctrl+C'],
      ['Copy as HTML', undefined],
      ['Select All', 'Ctrl+A'],
      ['Find…', 'Ctrl+F'],
      ['Show Source', 'Ctrl+U'],
      ['Hide Outline', 'Ctrl+Shift+O'],
      ['Zoom In', 'Ctrl++'],
      ['Zoom Out', 'Ctrl+-'],
      ['Reset Zoom', 'Ctrl+0'],
      ['Add to Favourites', 'Ctrl+D'],
      ['Paste Table from Excel…', 'Ctrl+Alt+V'],
      ['Save As…', 'Ctrl+Shift+S'],
      ['Print…', 'Ctrl+P'],
    ]);
  });

  it('names the toggles after what they will do next', () => {
    const items = documentContextMenuItems(
      { ...previewState, isSourceView: true, isOutlineVisible: false, isFavourite: true },
      translator,
    );

    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Show Preview', 'Show Outline', 'Remove from Favourites']),
    );
  });

  it('disables Copy without a selection and Favourite for a document that is not saved yet', () => {
    const items = documentContextMenuItems(
      { ...previewState, hasSelection: false, canBeFavourite: false },
      translator,
    );

    expect(items.filter((item) => item.isDisabled).map((item) => item.id)).toEqual([
      'copy',
      'toggleFavourite',
    ]);
  });

  it('turns the viewer actions into commands and leaves copying to the document view', () => {
    expect(commandForDocumentMenuItem('toggleSource')).toEqual({ kind: 'toggleSourceView' });
    expect(commandForDocumentMenuItem('pasteTable')).toEqual({ kind: 'showPasteTable' });
    expect(commandForDocumentMenuItem('copy')).toBeUndefined();
  });
});
