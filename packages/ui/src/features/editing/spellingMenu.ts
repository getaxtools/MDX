/** The editor content while the operating system checks its spelling. */
const SPELL_CHECKED_EDITOR = '.cm-content[spellcheck="true"]';

/**
 * A right-click in spell-checked editor text keeps the webview's own menu, which holds the
 * spelling suggestions and Add to dictionary. A menu asked for from the keyboard, with Shift+F10
 * or the Menu key, is the app's block menu instead, so the webview's menu is not wanted then.
 */
export function isSpellingMenuWanted(event: MouseEvent): boolean {
  const isFromPointer =
    'pointerType' in event && typeof event.pointerType === 'string' && event.pointerType !== '';
  return (
    isFromPointer && event.target instanceof Element && event.target.closest(SPELL_CHECKED_EDITOR) !== null
  );
}
