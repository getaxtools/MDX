import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PropertiesPanel from './PropertiesPanel.svelte';

describe('PropertiesPanel', () => {
  it('lists front matter properties under a collapsed Properties heading', () => {
    render(PropertiesPanel, {
      frontMatter: 'title: Release notes\ntags: [guide, release]',
      translator: createTranslator(),
    });

    const panel = screen.getByRole('group');

    expect(screen.getByText('Properties')).toBeTruthy();
    expect(panel.hasAttribute('open')).toBe(false);
    expect(screen.getAllByRole('term').map((name) => name.textContent)).toEqual(['title', 'tags']);
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      'Release notes',
      'guide, release',
    ]);
  });

  it('shows complex front matter as text', () => {
    render(PropertiesPanel, { frontMatter: 'author:\n  name: Ada', translator: createTranslator() });

    expect(screen.getByText(/name: Ada/)).toBeTruthy();
    expect(screen.queryByRole('term')).toBeNull();
  });
});
