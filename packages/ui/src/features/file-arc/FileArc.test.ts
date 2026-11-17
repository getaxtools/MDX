import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileArcEntry } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FileArc from './FileArc.svelte';

/** jsdom lays nothing out, so the arc is given the size of a tall document area. */
const AREA = { x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 900, width: 1200, height: 900 } as DOMRect;
const SOURCE = readFileSync(join(import.meta.dirname, 'FileArc.svelte'), 'utf8');

function entry(name: string, isOpenInTab = false): FileArcEntry {
  const displayPath = `C:\\Handbook\\docs\\${name}`;
  return {
    location: { canonicalKey: displayPath.toLowerCase(), displayPath, fileName: name },
    name,
    folderLabel: 'Handbook › docs',
    isOpenInTab,
  };
}

const TWELVE = [
  entry('README.md', true),
  entry('getting-started.md', true),
  entry('install.md'),
  ...Array.from({ length: 9 }, (_, index) => entry(`page-${String(index + 4)}.md`)),
];

function mediaMatching(queries: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: queries.includes(query) }));
}

function renderArc(props: Partial<Parameters<typeof render<typeof FileArc>>[1]> = {}) {
  const onChoose = vi.fn<(index: number) => void>();
  render(FileArc, {
    entries: TWELVE,
    highlighted: 2,
    kindId: 'markdownViewer',
    wording: 'files',
    translator: createTranslator(),
    onChoose,
    ...props,
  });
  return { onChoose, arc: screen.getByRole('listbox') };
}

describe('FileArc', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(AREA);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('the card describes the highlighted file', () => {
    const { arc } = renderArc({ lastEdited: 'yesterday' });

    const card = screen.getByRole('option', { selected: true });

    expect(card.textContent).toContain('install.md');
    expect(card.textContent).toContain('3 of 12');
    expect(card.textContent).toContain('Handbook › docs · edited yesterday');
    expect(arc.getAttribute('aria-activedescendant')).toBe(card.id);
  });

  it('leaves the time out until it is known', () => {
    renderArc();

    expect(screen.getByRole('option', { selected: true }).textContent).not.toContain('edited');
  });

  it('a long name keeps its position visible', () => {
    const longName = `${'a very long file name '.repeat(6)}.md`;
    renderArc({ entries: [entry(longName), ...TWELVE.slice(1)], highlighted: 0 });

    const card = screen.getByRole('option', { selected: true });

    expect(card.getAttribute('aria-label')).toBe(`${longName}, 1 of 12`);
    expect(card.querySelector('.card-position')?.textContent).toBe('1 of 12');
    expect(card.querySelector('.card-name')?.contains(card.querySelector('.card-position'))).toBe(false);
    expect(SOURCE).toMatch(/\.card-position \{[^}]*flex: none/);
    expect(SOURCE).toMatch(/\.card-name,[^{]*\{[^}]*text-overflow: ellipsis/);
  });

  it('the hint names the keys', () => {
    renderArc();

    const hint = document.querySelector('.hint');

    expect(hint?.getAttribute('aria-hidden')).toBe('true');
    expect(hint?.textContent).toContain('Ctrl + scroll or ↑ ↓');
    expect(hint?.textContent).toContain('Let go of Ctrl to open · Esc cancels');
  });

  it('open entries are marked', () => {
    renderArc();

    const readme = screen.getByRole('option', { name: 'README.md, 1 of 12, open in a tab' });

    expect(readme.querySelector('.open-dot')).not.toBeNull();
    expect(readme.getAttribute('title')).toBe('Open in a tab');
    expect(screen.getByRole('option', { name: 'page-4.md, 4 of 12' }).querySelector('.open-dot')).toBeNull();
  });

  it('shows the card and at most four names on each side', () => {
    renderArc({ entries: [...TWELVE, ...TWELVE.map((item) => entry(`more-${item.name}`))] });

    expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(9);
  });

  it('a click opens the clicked name', async () => {
    const { onChoose } = renderArc();

    await userEvent.click(screen.getByRole('option', { name: 'page-4.md, 4 of 12' }));

    expect(onChoose).toHaveBeenCalledWith(3);
  });

  it('is a list box named for files or notes that takes the focus', () => {
    const { arc } = renderArc({ wording: 'notes', kindId: 'notes' });

    expect(arc.getAttribute('aria-label')).toBe('Switch note');
    expect(document.activeElement).toBe(arc);
  });

  it('transparency effects off gives an opaque arc', () => {
    mediaMatching(['(prefers-reduced-transparency: reduce)']);

    const { arc } = renderArc();

    expect(arc.classList.contains('opaque')).toBe(true);
    expect(SOURCE).toMatch(/\.opaque \.dial \{[^}]*backdrop-filter: none/);
  });

  it('the arc is outlined in forced colours', () => {
    expect(SOURCE).toMatch(
      /@media \(forced-colors: active\) \{[\s\S]*\.card \{[^}]*outline: 3px solid Highlight/,
    );
    expect(SOURCE).toMatch(/@media \(forced-colors: active\) \{[\s\S]*\.dial \{[^}]*background: Canvas/);
  });

  it('notes use the Notes colour', () => {
    const { arc } = renderArc({ kindId: 'notes', wording: 'notes' });

    expect(arc.style.getPropertyValue('--kind')).toBe('var(--color-kind-notes)');
  });

  it('the open motion ends within 200 milliseconds', () => {
    const { arc } = renderArc();

    const openMs = Number.parseFloat(arc.style.getPropertyValue('--arc-open-ms'));
    const closeMs = Number.parseFloat(arc.style.getPropertyValue('--arc-close-ms'));

    expect(openMs).toBeGreaterThan(0);
    expect(openMs).toBeLessThanOrEqual(200);
    expect(closeMs).toBeLessThanOrEqual(150);
  });

  it('reduced motion shows the arc without movement', () => {
    mediaMatching(['(prefers-reduced-motion: reduce)']);

    const { arc } = renderArc();

    for (const property of ['--arc-open-ms', '--arc-step-ms', '--arc-close-ms', '--arc-open-slide'])
      expect(Number.parseFloat(arc.style.getPropertyValue(property))).toBe(0);
  });

  it('a closing arc ignores input and reports when it has gone', async () => {
    vi.useFakeTimers();
    const onClosed = vi.fn();
    const { arc } = renderArc({ isClosing: true, onClosed });

    await vi.advanceTimersByTimeAsync(400);

    // jsdom has no inert property, so Svelte sets it either as an attribute or as a plain property.
    expect([arc.hasAttribute('inert'), Reflect.get(arc, 'inert')]).toContain(true);
    expect(onClosed).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
