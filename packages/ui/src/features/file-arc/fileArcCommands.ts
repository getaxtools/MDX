import type { FileArcDirection } from '@mdx/core';

/** Ctrl+Down and Ctrl+Up: they need Ctrl held, so the palette does not offer them. */
export type FileArcCommand = { readonly kind: 'stepFileArcForward' } | { readonly kind: 'stepFileArcBack' };

const DIRECTIONS: Readonly<Record<FileArcCommand['kind'], FileArcDirection>> = {
  stepFileArcForward: 'forward',
  stepFileArcBack: 'back',
};

export function isFileArcCommand(command: { readonly kind: string }): command is FileArcCommand {
  return Object.hasOwn(DIRECTIONS, command.kind);
}

export function fileArcDirectionOf(command: FileArcCommand): FileArcDirection {
  return DIRECTIONS[command.kind];
}

const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/** A dialog, a menu, the palette or the control wheel is open, so the arc keys do nothing. */
export function isOverlayOpenIn(page: ParentNode): boolean {
  return page.querySelector(OVERLAYS) !== null;
}

/** What the window does with the arc's keys and the wheel; false means the arc did not take them. */
export interface FileArcControls {
  readonly step: (direction: FileArcDirection) => boolean;
  readonly moveWithWheel: (event: WheelEvent) => boolean;
}
