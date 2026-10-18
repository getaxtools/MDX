export type ViewerCommand =
  | { readonly kind: 'openDocuments' }
  | { readonly kind: 'closeActiveTab' }
  | { readonly kind: 'nextTab' }
  | { readonly kind: 'previousTab' }
  | { readonly kind: 'activateTabNumber'; readonly numberKey: number }
  | { readonly kind: 'reopenClosedTab' }
  | { readonly kind: 'toggleFavourite' };

export type DesktopPlatform = 'windows' | 'macos' | 'linux';

export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing'
>;

const TAB_NUMBER_KEY = /^[1-9]$/;

export function commandForShortcut(
  event: ShortcutKeyEvent,
  platform: DesktopPlatform,
): ViewerCommand | undefined {
  if (event.isComposing || event.altKey) return undefined;
  if (event.ctrlKey && event.key === 'Tab') return { kind: event.shiftKey ? 'previousTab' : 'nextTab' };
  const isCommandModifierPressed = platform === 'macos' ? event.metaKey : event.ctrlKey;
  if (!isCommandModifierPressed) return undefined;
  if (TAB_NUMBER_KEY.test(event.key)) return { kind: 'activateTabNumber', numberKey: Number(event.key) };
  return event.shiftKey ? commandForShiftedKey(event.key) : commandForKey(event.key);
}

function commandForKey(key: string): ViewerCommand | undefined {
  switch (key.toLowerCase()) {
    case 'o':
      return { kind: 'openDocuments' };
    case 'w':
    case 'f4':
      return { kind: 'closeActiveTab' };
    case 'd':
      return { kind: 'toggleFavourite' };
    default:
      return undefined;
  }
}

function commandForShiftedKey(key: string): ViewerCommand | undefined {
  return key.toLowerCase() === 't' ? { kind: 'reopenClosedTab' } : undefined;
}
