import type { EditingMode } from './editingMode';

/** Whether a slash at the start of a line or after a space opens the insert menu, set for each mode. */
export interface SlashMenuSettings {
  readonly isInRichText: boolean;
  readonly isInSource: boolean;
}

export const SLASH_MENU_OFF: SlashMenuSettings = { isInRichText: false, isInSource: false };

export function isSlashMenuOnIn(settings: SlashMenuSettings, mode: EditingMode): boolean {
  return mode === 'richText' ? settings.isInRichText : settings.isInSource;
}
