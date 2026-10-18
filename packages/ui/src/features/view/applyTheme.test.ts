import { describe, expect, it } from 'vitest';
import { applyTheme } from './applyTheme';

describe('applyTheme', () => {
  it('marks the page with a chosen light or dark theme', () => {
    const root = document.createElement('html');

    applyTheme(root, 'dark');

    expect(root.dataset.theme).toBe('dark');
  });

  it('follows the system setting by removing the mark', () => {
    const root = document.createElement('html');
    applyTheme(root, 'light');

    applyTheme(root, 'system');

    expect(root.dataset.theme).toBeUndefined();
  });
});
