import type { ThemePreference } from '@mdx/core';

export function applyTheme(root: HTMLElement, theme: ThemePreference): void {
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
