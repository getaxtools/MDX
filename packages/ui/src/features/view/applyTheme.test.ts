import { describe, expect, it } from 'vitest';
import { applyTheme } from './applyTheme';

describe('applyTheme', () => {
  it('marks the page with a chosen light or dark theme', () => {
    const root = document.createElement('html');

    applyTheme(root, 'dark');

    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.colorScheme).toBe('dark');
  });

  it('marks a named theme with the light or dark colours it is built on', () => {
    const root = document.createElement('html');

    applyTheme(root, 'nord');
    const nordScheme = root.dataset.colorScheme;
    applyTheme(root, 'sepia');

    expect([nordScheme, root.dataset.theme, root.dataset.colorScheme]).toEqual(['dark', 'sepia', 'light']);
  });

  it('follows the system setting by removing the marks', () => {
    const root = document.createElement('html');
    applyTheme(root, 'solarizedDark');

    applyTheme(root, 'system');

    expect(root.dataset.theme).toBeUndefined();
    expect(root.dataset.colorScheme).toBeUndefined();
  });
});
