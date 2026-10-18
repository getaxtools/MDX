export interface ContextMenuItem<ItemId extends string> {
  readonly id: ItemId;
  readonly label: string;
  readonly isDisabled?: boolean;
  readonly hasSeparatorBefore?: boolean;
}

export interface ContextMenuRequest {
  readonly x: number;
  readonly y: number;
}

/** Where to open a context menu: at the pointer, or below the element for keyboard requests. */
export function contextMenuPosition(event: MouseEvent | KeyboardEvent): ContextMenuRequest {
  if (event instanceof MouseEvent && (event.clientX !== 0 || event.clientY !== 0)) {
    return { x: event.clientX, y: event.clientY };
  }
  const target = event.currentTarget instanceof Element ? event.currentTarget : undefined;
  const bounds = target?.getBoundingClientRect();
  return { x: bounds?.left ?? 0, y: bounds?.bottom ?? 0 };
}

export function isContextMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}
