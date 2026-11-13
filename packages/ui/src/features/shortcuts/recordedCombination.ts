import type { DesktopPlatform } from '../viewer/viewerCommands';
import { pressedKeyName, type ShortcutKeyEvent } from './commandShortcuts';
import type { KeyCombination } from './describeCombination';

const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  'Control',
  'Shift',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'CapsLock',
  'NumLock',
  'Fn',
]);
const UNUSABLE_KEYS: ReadonlySet<string> = new Set(['Dead', 'Process', 'Unidentified']);

/** The combination a key press makes, in the shortcut table notation; nothing for a lone modifier. */
export function recordedCombination(
  event: ShortcutKeyEvent,
  platform: DesktopPlatform,
): KeyCombination | undefined {
  if (event.isComposing || MODIFIER_KEYS.has(event.key) || UNUSABLE_KEYS.has(event.key)) return undefined;
  const isCommandModifierPressed = platform === 'macos' ? event.metaKey : event.ctrlKey;
  const isOtherPlatformModifierPressed = platform === 'macos' ? event.ctrlKey : event.metaKey;
  if (isOtherPlatformModifierPressed) return undefined;
  return [
    ...(isCommandModifierPressed ? ['ctrl'] : []),
    ...(event.altKey ? ['alt'] : []),
    ...(event.shiftKey ? ['shift'] : []),
    keyNameOf(event.key),
  ];
}

/** Letters are kept upper case, as in the shortcut table; `ß` stays as it is rather than becoming `SS`. */
function keyNameOf(key: string): string {
  const name = pressedKeyName(key);
  const upperCase = name.toUpperCase();
  return name.length === 1 && upperCase.length === 1 ? upperCase : name;
}
