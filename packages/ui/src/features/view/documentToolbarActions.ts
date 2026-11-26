import type { ViewSettings } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import type { ViewerCommand } from '../viewer/viewerCommands';
import { viewOptionMenus, type ViewOptionMenuId } from './viewOptionMenus';

export type DocumentButtonId = 'open' | 'favourite' | 'editing' | 'previewBeside';
export type DocumentToolbarActionId = DocumentButtonId | ViewOptionMenuId;

/** The islands from left to right; when the toolbar is too narrow the last ones move into More options. */
export const DOCUMENT_TOOLBAR_ISLANDS: readonly (readonly DocumentToolbarActionId[])[] = [
  ['open', 'favourite'],
  ['editing', 'previewBeside'],
  ['theme', 'textWidth', 'documentStyle'],
];

export const DOCUMENT_BUTTON_COMMANDS: Readonly<Record<DocumentButtonId, ViewerCommand>> = {
  open: { kind: 'openDocuments' },
  favourite: { kind: 'toggleFavourite' },
  editing: { kind: 'toggleEditing' },
  previewBeside: { kind: 'togglePreviewBesideEditor' },
};

export interface DocumentToolbarState {
  readonly viewSettings: ViewSettings;
  readonly hasDocument: boolean;
  readonly canBeFavourite: boolean;
  readonly isFavourite: boolean;
  readonly isEditing: boolean;
}

export function isDocumentButton(id: DocumentToolbarActionId): id is DocumentButtonId {
  return Object.hasOwn(DOCUMENT_BUTTON_COMMANDS, id);
}

function buttonItem(
  id: DocumentButtonId,
  state: DocumentToolbarState,
  translator: Translator,
): ContextMenuItem<DocumentToolbarActionId> {
  const shortcut = shortcutLabelFor(DOCUMENT_BUTTON_COMMANDS[id], translator);
  const items: Record<DocumentButtonId, Omit<ContextMenuItem<DocumentToolbarActionId>, 'id'>> = {
    open: { label: translator.translate('toolbar.open') },
    favourite: {
      label: translator.translate('favourites.toggle'),
      isChecked: state.isFavourite,
      isDisabled: !state.canBeFavourite,
    },
    editing: {
      label: translator.translate(state.isEditing ? 'toolbar.preview' : 'toolbar.edit'),
      isDisabled: !state.hasDocument,
    },
    previewBeside: {
      label: translator.translate('toolbar.previewBeside'),
      isChecked: state.viewSettings.isPreviewBesideEditor,
      isDisabled: !state.hasDocument,
    },
  };
  return { id, ...items[id], shortcut };
}

/** The actions of the hidden islands in toolbar order, each island after the first behind a separator. */
export function moreOptionsItems(
  hiddenIslands: readonly (readonly DocumentToolbarActionId[])[],
  state: DocumentToolbarState,
  translator: Translator,
): ContextMenuItem<DocumentToolbarActionId>[] {
  const viewMenus = viewOptionMenus(state.viewSettings, translator);
  return hiddenIslands.flatMap((island, islandIndex) =>
    island.map((id, index) => ({
      ...(isDocumentButton(id)
        ? buttonItem(id, state, translator)
        : { id, label: viewMenus.find((menu) => menu.id === id)?.label ?? id }),
      hasSeparatorBefore: islandIndex > 0 && index === 0,
    })),
  );
}
