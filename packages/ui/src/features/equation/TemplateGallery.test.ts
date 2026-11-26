import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EQUATION_TEMPLATE_GROUPS, type EquationTemplate } from './equationTemplates';
import TemplateGallery from './TemplateGallery.svelte';

function renderGallery() {
  const onChoose = vi.fn<(template: EquationTemplate) => void>();
  render(TemplateGallery, {
    groups: EQUATION_TEMPLATE_GROUPS,
    translator: createTranslator(),
    previewFormula: (tex: string) =>
      Promise.resolve({ kind: 'typeset', html: `<span class="typeset">${tex}</span>` }),
    onChoose,
  });
  const gallery = screen.getByRole('grid', { name: 'Formula templates' });
  return { gallery, onChoose };
}

describe('TemplateGallery', () => {
  it('arrow keys move in the gallery, one Tab stop', async () => {
    const { gallery } = renderGallery();
    const cells = within(gallery).getAllByRole('gridcell');
    const tabStops = cells.filter((cell) => cell.tabIndex === 0);

    cells[0]?.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    const afterRight = document.activeElement;
    await userEvent.keyboard('{ArrowDown}');
    const afterDown = document.activeElement;

    expect(tabStops).toHaveLength(1);
    expect(afterRight).toBe(screen.getByRole('gridcell', { name: 'Nth root' }));
    expect(afterDown).toBe(screen.getByRole('gridcell', { name: 'Integral' }));
    expect(
      within(gallery)
        .getAllByRole('gridcell')
        .filter((cell) => cell.tabIndex === 0),
    ).toEqual([afterDown]);
  });

  it('each template has an accessible name and each group a heading', () => {
    const { gallery } = renderGallery();

    const names = within(gallery)
      .getAllByRole('gridcell')
      .map((cell) => cell.querySelector('.template-name')?.textContent ?? '');
    const groups = within(gallery)
      .getAllByRole('rowheader')
      .map((header) => header.textContent);

    expect(names.every((name) => name !== '' && !name.startsWith('equation.'))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(groups).toEqual([
      'Structures',
      'Big operators',
      'Brackets',
      'Matrices',
      'Greek letters',
      'Relations and arrows',
      'Common formulas',
    ]);
  });

  it('shows each template typeset with boxes for its empty placeholders', async () => {
    renderGallery();

    const fraction = screen.getByRole('gridcell', { name: 'Fraction' });

    await vi.waitFor(() =>
      expect(fraction.querySelector('.typeset')?.textContent).toBe(String.raw`\frac{\square}{\square}`),
    );
  });

  it('Enter and a click choose a template', async () => {
    const { onChoose } = renderGallery();
    const pi = screen.getByRole('gridcell', { name: 'Pi' });

    pi.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('gridcell', { name: 'Sum' }));

    expect(onChoose.mock.calls.map(([template]) => template.nameKey)).toEqual([
      'equation.template.pi',
      'equation.template.sum',
    ]);
  });
});
