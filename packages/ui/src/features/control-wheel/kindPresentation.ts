import type { WorkspaceKindId } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';

/** Stroke paths on a 24 by 24 grid, drawn like the other activity bar icons. */
export type IconPaths = readonly string[];

/** A kind's identity colour, as hex, for themes built on light and on dark colours. */
export interface KindColour {
  readonly light: string;
  readonly dark: string;
}

export const KIND_NAME_KEYS: Readonly<Record<WorkspaceKindId, MessageKey>> = {
  markdownViewer: 'workspaceKinds.kind.markdownViewer',
  notes: 'workspaceKinds.kind.notes',
  specViewer: 'workspaceKinds.kind.specViewer',
};

export const KIND_DESCRIPTION_KEYS: Readonly<Record<WorkspaceKindId, MessageKey>> = {
  markdownViewer: 'workspaceKinds.description.markdownViewer',
  notes: 'workspaceKinds.description.notes',
  specViewer: 'workspaceKinds.description.specViewer',
};

export const KIND_ICONS: Readonly<Record<WorkspaceKindId, IconPaths>> = {
  markdownViewer: ['M6 3.5h8l4 4v13H6z', 'M14 3.5v4h4', 'M9 12h6M9 15.5h6'],
  notes: ['M7 3.5h10.5v17H7z', 'M10 3.5v17', 'M5 7.5h4M5 12h4M5 16.5h4'],
  specViewer: ['M8.5 5H6v15.5h12V5h-2.5', 'M9 3.5h6v3H9z', 'M9.5 11h5M9.5 14.5h5M9.5 18h3'],
};

/** The values behind the `--color-kind-*` tokens; the light ones come from the workspace colour palette. */
export const KIND_COLOURS: Readonly<Record<WorkspaceKindId, KindColour>> = {
  markdownViewer: { light: '#3b6fd8', dark: '#7aa2f7' },
  notes: { light: '#a86f00', dark: '#e0a83a' },
  specViewer: { light: '#1c8f82', dark: '#4fc1b1' },
};

export const KIND_COLOUR_TOKENS: Readonly<Record<WorkspaceKindId, string>> = {
  markdownViewer: '--color-kind-markdown-viewer',
  notes: '--color-kind-notes',
  specViewer: '--color-kind-spec-viewer',
};

export const GEAR_ICON: IconPaths = [
  'M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z',
  'M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
];

export const CHECK_ICON: IconPaths = ['M5 12.5l4.5 4.5L19 7.5'];

export function kindNameOf(kindId: WorkspaceKindId, translator: Translator): string {
  return translator.translate(KIND_NAME_KEYS[kindId]);
}

export function kindDescriptionOf(kindId: WorkspaceKindId, translator: Translator): string {
  return translator.translate(KIND_DESCRIPTION_KEYS[kindId]);
}

/** The kind's colour as a CSS value that follows the current theme. */
export function kindColourOf(kindId: WorkspaceKindId): string {
  return `var(${KIND_COLOUR_TOKENS[kindId]})`;
}
