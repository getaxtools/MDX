import { isRecord } from '../session/savedValues';

/** Keys the user chose for a command, by command id; an empty combination means the command has no shortcut. */
export type ShortcutOverrides = Readonly<Record<string, readonly string[]>>;

export const MAX_SHORTCUT_PARTS = 4;
export const MAX_SHORTCUT_PART_LENGTH = 16;
const MAX_SHORTCUT_OVERRIDES = 100;
const MODIFIERS: readonly string[] = ['ctrl', 'alt', 'shift'];

/** Reads saved shortcut choices, dropping any combination that could not be typed. */
export function parseShortcutOverrides(saved: unknown): ShortcutOverrides {
  if (!isRecord(saved)) return {};
  const validOverrides = Object.entries(saved).flatMap(([commandId, combination]) =>
    isSavedCombination(combination) ? [[commandId, combination] as const] : [],
  );
  return Object.fromEntries(validOverrides.slice(0, MAX_SHORTCUT_OVERRIDES));
}

function isSavedCombination(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  if (value.length > MAX_SHORTCUT_PARTS) return false;
  const parts: unknown[] = value;
  const isEveryPartValid = parts.every(
    (part) => typeof part === 'string' && part.length > 0 && part.length <= MAX_SHORTCUT_PART_LENGTH,
  );
  return isEveryPartValid && parts.some((part) => !MODIFIERS.includes(part as string));
}
