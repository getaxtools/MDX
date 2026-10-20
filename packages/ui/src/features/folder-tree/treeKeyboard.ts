const TREE_ITEM_SELECTOR = '[role="treeitem"]';
const TYPE_AHEAD_RESET_MS = 700;

type KeyAction = (rows: readonly HTMLElement[], current: HTMLElement) => HTMLElement | undefined;

const KEY_ACTIONS: Readonly<Record<string, KeyAction>> = {
  ArrowDown: (rows, current) => rows[rows.indexOf(current) + 1],
  ArrowUp: (rows, current) => rows[rows.indexOf(current) - 1],
  Home: (rows) => rows[0],
  End: (rows) => rows.at(-1),
  ArrowRight: (rows, current) => expandOrEnter(rows, current),
  ArrowLeft: (rows, current) => collapseOrLeave(rows, current),
};

/**
 * The WAI-ARIA tree keys for a `role="tree"` element: arrows, Home, End and type-ahead, with one Tab stop.
 * Rows open themselves on Enter and Space (see `activateWithKeyboard`).
 */
export function treeKeyboard(tree: HTMLElement): { destroy: () => void } {
  let typedText = '';
  let typedAtMs = 0;

  function handleKeydown(event: KeyboardEvent) {
    const current = treeItemReceiving(event);
    if (!current) return;
    const rows = treeItemsOf(tree);
    const action = KEY_ACTIONS[event.key];
    const target = action ? action(rows, current) : typeAhead(event, rows, current);
    if (!action && !target) return;
    event.preventDefault();
    target?.focus();
  }

  function typeAhead(event: KeyboardEvent, rows: readonly HTMLElement[], current: HTMLElement) {
    if (event.key.length !== 1 || event.key === ' ') return undefined;
    typedText = event.timeStamp - typedAtMs > TYPE_AHEAD_RESET_MS ? event.key : typedText + event.key;
    typedAtMs = event.timeStamp;
    return rowStartingWith(rows, current, typedText);
  }

  function handleFocusin(event: FocusEvent) {
    if (event.target instanceof HTMLElement && event.target.matches(TREE_ITEM_SELECTOR)) {
      makeTabStop(tree, event.target);
    }
  }

  const observer = new MutationObserver(() => ensureOneTabStop(tree));
  observer.observe(tree, { childList: true, subtree: true });
  ensureOneTabStop(tree);
  tree.addEventListener('keydown', handleKeydown);
  tree.addEventListener('focusin', handleFocusin);
  return {
    destroy: () => {
      observer.disconnect();
      tree.removeEventListener('keydown', handleKeydown);
      tree.removeEventListener('focusin', handleFocusin);
    },
  };
}

/** Opens or toggles a tree row with Enter or Space, as a button would. */
export function activateWithKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (!(event.currentTarget instanceof HTMLElement)) return;
  event.preventDefault();
  event.currentTarget.click();
}

/** The row a plain key press went to, unless the row already handled it. */
function treeItemReceiving(event: KeyboardEvent): HTMLElement | undefined {
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (event.defaultPrevented || hasModifier || !(event.target instanceof Element)) return undefined;
  return event.target.closest<HTMLElement>(TREE_ITEM_SELECTOR) ?? undefined;
}

function treeItemsOf(tree: HTMLElement): HTMLElement[] {
  return [...tree.querySelectorAll<HTMLElement>(TREE_ITEM_SELECTOR)];
}

function levelOf(row: HTMLElement): number {
  return Number(row.getAttribute('aria-level') ?? '1');
}

function expandOrEnter(rows: readonly HTMLElement[], current: HTMLElement): HTMLElement | undefined {
  const expanded = current.getAttribute('aria-expanded');
  if (expanded === 'false') {
    current.click();
    return current;
  }
  if (expanded !== 'true') return undefined;
  const next = rows[rows.indexOf(current) + 1];
  return next && levelOf(next) > levelOf(current) ? next : undefined;
}

function collapseOrLeave(rows: readonly HTMLElement[], current: HTMLElement): HTMLElement | undefined {
  if (current.getAttribute('aria-expanded') === 'true') {
    current.click();
    return current;
  }
  const level = levelOf(current);
  return rows
    .slice(0, rows.indexOf(current))
    .reverse()
    .find((row) => levelOf(row) < level);
}

function rowStartingWith(
  rows: readonly HTMLElement[],
  current: HTMLElement,
  typedText: string,
): HTMLElement | undefined {
  const start = rows.indexOf(current) + (typedText.length === 1 ? 1 : 0);
  const ordered = [...rows.slice(start), ...rows.slice(0, start)];
  const prefix = typedText.toLocaleLowerCase();
  return ordered.find((row) => row.textContent.trim().toLocaleLowerCase().startsWith(prefix));
}

function makeTabStop(tree: HTMLElement, row: HTMLElement): void {
  for (const other of treeItemsOf(tree)) other.tabIndex = other === row ? 0 : -1;
}

function ensureOneTabStop(tree: HTMLElement): void {
  const rows = treeItemsOf(tree);
  if (rows.some((row) => row.tabIndex === 0)) return;
  const tabStop = rows.find((row) => row.getAttribute('aria-selected') === 'true') ?? rows[0];
  if (tabStop) makeTabStop(tree, tabStop);
}
