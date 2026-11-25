export type TabDirection = 'forward' | 'backward';

export type DialogKeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'repeat'
  | 'ctrlKey'
  | 'metaKey'
  | 'shiftKey'
  | 'altKey'
  | 'isComposing'
  | 'defaultPrevented'
  | 'target'
>;

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), ' +
  'textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';
const FIELD =
  'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), ' +
  '[contenteditable]:not([contenteditable="false"])';
const OWNS_ENTER =
  'button, a[href], summary, select, input[type="button"], input[type="submit"], input[type="reset"], ' +
  'input[type="file"], input[type="image"], input[type="color"], [role="button"], [role="link"], ' +
  '[role="menuitem"], [role="option"], [role="gridcell"], [role="treeitem"], [role="tab"], [role="checkbox"], ' +
  '[role="switch"], [role="radio"]';
const MULTI_LINE = 'textarea, [contenteditable]:not([contenteditable="false"])';

function targetElement(event: DialogKeyEvent): Element | undefined {
  return event.target instanceof Element ? event.target : undefined;
}

function isUnhandledEnter(event: DialogKeyEvent): boolean {
  if (event.key !== 'Enter' || event.repeat || event.isComposing || event.defaultPrevented) return false;
  return !event.shiftKey && !event.altKey;
}

/** Enter presses the primary button unless the focused control uses Enter itself; a multi-line field needs Ctrl+Enter. */
export function activatesPrimary(event: DialogKeyEvent): boolean {
  if (!isUnhandledEnter(event)) return false;
  const target = targetElement(event);
  if (target?.closest(OWNS_ENTER)) return false;
  if (target?.closest(MULTI_LINE)) return event.ctrlKey || event.metaKey;
  return true;
}

export function focusablesIn(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

export function firstFieldIn(container: Element): HTMLElement | undefined {
  return container.querySelector<HTMLElement>(FIELD) ?? undefined;
}

/** Where Tab must move focus so it stays inside `container`, or undefined when the browser's own move stays inside. */
export function wrappedFocusTarget(
  container: Element,
  activeElement: Element | null,
  direction: TabDirection,
): HTMLElement | undefined {
  const focusables = focusablesIn(container);
  const [first, last] = [focusables[0], focusables.at(-1)];
  const edge = direction === 'forward' ? last : first;
  const isInside = activeElement !== null && container.contains(activeElement);
  if (isInside && activeElement !== edge && activeElement !== container) return undefined;
  return direction === 'forward' ? first : last;
}
