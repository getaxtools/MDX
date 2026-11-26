import type { WorkspaceColour, WorkspaceIcon } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import type { IconPaths } from '../control-wheel/kindPresentation';

/** Drawn on a 24 by 24 grid with round strokes, like the kind icons. */
export const WORKSPACE_ICON_PATHS: Readonly<Record<WorkspaceIcon, IconPaths>> = {
  book: ['M5 4.5h6.5a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5z', 'M19 4.5h-5.5v15H19z'],
  notebook: ['M6.5 3.5h11v17h-11z', 'M9.5 3.5v17', 'M4.5 8h3M4.5 12h3M4.5 16h3'],
  folder: ['M3.5 6.5h6l2 2h9v10h-17z'],
  briefcase: ['M3.5 8h17v11h-17z', 'M9 8V5.5h6V8', 'M3.5 13h17'],
  flask: ['M9.5 3.5h5', 'M10.5 3.5v6l-5 9.5h13l-5-9.5v-6'],
  star: ['M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4-4.9-2.8-4.9 2.8 1.1-5.4-4-3.7 5.4-.6z'],
};

/** Mid tones that keep 3:1 contrast as a small mark on the light and dark backgrounds. */
export const WORKSPACE_COLOUR_VALUES: Readonly<Record<WorkspaceColour, string>> = {
  blue: '#3b6fd8',
  teal: '#1c8f82',
  green: '#3a8f3a',
  amber: '#a86f00',
  red: '#cc3f34',
  purple: '#8556cc',
  grey: '#737a85',
};

export const WORKSPACE_ICON_NAME_KEYS: Readonly<Record<WorkspaceIcon, MessageKey>> = {
  book: 'workspaces.icon.book',
  notebook: 'workspaces.icon.notebook',
  folder: 'workspaces.icon.folder',
  briefcase: 'workspaces.icon.briefcase',
  flask: 'workspaces.icon.flask',
  star: 'workspaces.icon.star',
};

export const WORKSPACE_COLOUR_NAME_KEYS: Readonly<Record<WorkspaceColour, MessageKey>> = {
  blue: 'workspaces.colour.blue',
  teal: 'workspaces.colour.teal',
  green: 'workspaces.colour.green',
  amber: 'workspaces.colour.amber',
  red: 'workspaces.colour.red',
  purple: 'workspaces.colour.purple',
  grey: 'workspaces.colour.grey',
};

/** Saved values outside the fixed sets, such as ones a newer version added, are shown as none. */
export function workspaceIconOf(icon: string | null): WorkspaceIcon | undefined {
  return icon !== null && Object.hasOwn(WORKSPACE_ICON_PATHS, icon) ? (icon as WorkspaceIcon) : undefined;
}

/** The icon a workspace shows: its own, or else the icon of its kind. */
export function workspaceIconPathsOf(icon: string | null, kindIcon: IconPaths): IconPaths {
  const ownIcon = workspaceIconOf(icon);
  return ownIcon ? WORKSPACE_ICON_PATHS[ownIcon] : kindIcon;
}

export function colourValueOf(colour: string | null): string | undefined {
  const known = workspaceColourOf(colour);
  return known ? WORKSPACE_COLOUR_VALUES[known] : undefined;
}

export function workspaceColourOf(colour: string | null): WorkspaceColour | undefined {
  return colour !== null && Object.hasOwn(WORKSPACE_COLOUR_VALUES, colour)
    ? (colour as WorkspaceColour)
    : undefined;
}
