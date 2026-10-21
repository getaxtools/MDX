import type { MessageKey, Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import type { ViewerCommand } from '../viewer/viewerCommands';

export type DocumentMenuItemId =
  | 'copy'
  | 'copyAsHtml'
  | 'selectAll'
  | 'find'
  | 'toggleSource'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'toggleOutline'
  | 'toggleFavourite'
  | 'pasteTable'
  | 'saveAs'
  | 'print';

export interface DocumentMenuState {
  readonly hasSelection: boolean;
  readonly isSourceView: boolean;
  readonly isOutlineVisible: boolean;
  readonly isFavourite: boolean;
  readonly canBeFavourite: boolean;
}

type ItemHandledByTheView = 'copy' | 'copyAsHtml' | 'selectAll';

const ITEMS_HANDLED_BY_THE_VIEW: readonly DocumentMenuItemId[] = ['copy', 'copyAsHtml', 'selectAll'];

const COMMANDS_BY_ITEM: Readonly<Record<Exclude<DocumentMenuItemId, ItemHandledByTheView>, ViewerCommand>> = {
  find: { kind: 'showFind' },
  toggleSource: { kind: 'toggleSourceView' },
  zoomIn: { kind: 'zoomIn' },
  zoomOut: { kind: 'zoomOut' },
  resetZoom: { kind: 'resetZoom' },
  toggleOutline: { kind: 'toggleOutline' },
  toggleFavourite: { kind: 'toggleFavourite' },
  pasteTable: { kind: 'showPasteTable' },
  saveAs: { kind: 'saveDocumentAs' },
  print: { kind: 'print' },
};

export function documentContextMenuItems(
  state: DocumentMenuState,
  translator: Translator,
): ContextMenuItem<DocumentMenuItemId>[] {
  const item = (
    id: DocumentMenuItemId,
    labelKey: MessageKey,
    extra: Partial<ContextMenuItem<DocumentMenuItemId>> = {},
  ): ContextMenuItem<DocumentMenuItemId> => ({
    id,
    label: translator.translate(labelKey),
    shortcut: shortcutOf(id, translator),
    ...extra,
  });
  return [
    item('copy', 'menu.edit.copy', { isDisabled: !state.hasSelection }),
    item('copyAsHtml', 'menu.edit.copyAsHtml', { isDisabled: state.isSourceView }),
    item('selectAll', 'menu.edit.selectAll'),
    item('find', 'menu.edit.find', { hasSeparatorBefore: true }),
    item('toggleSource', state.isSourceView ? 'document.menu.showPreview' : 'document.menu.showSource'),
    item('toggleOutline', state.isOutlineVisible ? 'document.menu.hideOutline' : 'document.menu.showOutline'),
    item('zoomIn', 'menu.view.zoomIn', { hasSeparatorBefore: true }),
    item('zoomOut', 'menu.view.zoomOut'),
    item('resetZoom', 'menu.view.resetZoom'),
    item('toggleFavourite', state.isFavourite ? 'favourites.remove' : 'favourites.add', {
      hasSeparatorBefore: true,
      isDisabled: !state.canBeFavourite,
    }),
    item('pasteTable', 'menu.edit.pasteTable'),
    item('saveAs', 'menu.file.saveAs', { hasSeparatorBefore: true }),
    item('print', 'menu.file.print'),
  ];
}

export function commandForDocumentMenuItem(itemId: DocumentMenuItemId): ViewerCommand | undefined {
  return ITEMS_HANDLED_BY_THE_VIEW.includes(itemId)
    ? undefined
    : COMMANDS_BY_ITEM[itemId as Exclude<DocumentMenuItemId, ItemHandledByTheView>];
}

const SHORTCUTS_HANDLED_BY_THE_WEBVIEW: Readonly<Partial<Record<DocumentMenuItemId, string>>> = {
  copy: 'C',
  selectAll: 'A',
};

function shortcutOf(itemId: DocumentMenuItemId, translator: Translator): string | undefined {
  const webviewKey = SHORTCUTS_HANDLED_BY_THE_WEBVIEW[itemId];
  if (webviewKey !== undefined) return `${translator.translate('keys.ctrl')}+${webviewKey}`;
  const command = commandForDocumentMenuItem(itemId);
  return command ? shortcutLabelFor(command, translator) : undefined;
}
