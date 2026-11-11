import { THEME_COLOR_SCHEMES, type ThemePreference } from '@mdx/core';

export function applyTheme(root: HTMLElement, theme: ThemePreference): void {
  if (theme === 'system') {
    delete root.dataset.theme;
    delete root.dataset.colorScheme;
    return;
  }
  root.dataset.theme = theme;
  root.dataset.colorScheme = THEME_COLOR_SCHEMES[theme];
}
