import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateWithKeyboard, treeKeyboard } from './treeKeyboard';

interface RowSpec {
  readonly name: string;
  readonly level: number;
  readonly isExpanded?: boolean;
}

/** Docs (expanded) > Guides (collapsed), Plan.md; then Notes (collapsed) and README.md at the top level. */
const ROWS: readonly RowSpec[] = [
  { name: 'Docs', level: 1, isExpanded: true },
  { name: 'Guides', level: 2, isExpanded: false },
  { name: 'Plan.md', level: 2 },
  { name: 'Notes', level: 1, isExpanded: false },
  { name: 'README.md', level: 1 },
];

function renderTree(rows: readonly RowSpec[] = ROWS) {
  const tree = document.createElement('ul');
  tree.setAttribute('role', 'tree');
  const onClick = vi.fn();
  for (const { name, level, isExpanded } of rows) {
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(level));
    if (isExpanded !== undefined) row.setAttribute('aria-expanded', String(isExpanded));
    row.tabIndex = -1;
    row.textContent = name;
    row.addEventListener('click', () => {
      onClick(name);
    });
    row.addEventListener('keydown', activateWithKeyboard);
    tree.append(row);
  }
  document.body.append(tree);
  const keyboard = treeKeyboard(tree);
  const row = (name: string) =>
    [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
      (element) => element.textContent === name,
    ) ?? tree;
  return { tree, row, onClick, keyboard };
}

const focusedName = () => document.activeElement?.textContent;

describe('treeKeyboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('makes the first row the only Tab stop', () => {
    const { row } = renderTree();

    expect(row('Docs').tabIndex).toBe(0);
    expect(row('Plan.md').tabIndex).toBe(-1);
  });

  it('moves through the rows with the arrow keys, Home and End', async () => {
    const { row } = renderTree();
    row('Docs').focus();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(focusedName()).toBe('Plan.md');
    await userEvent.keyboard('{ArrowUp}');
    expect(focusedName()).toBe('Guides');
    await userEvent.keyboard('{End}');
    expect(focusedName()).toBe('README.md');
    await userEvent.keyboard('{Home}');

    expect(focusedName()).toBe('Docs');
  });

  it('keeps the focused row as the Tab stop', async () => {
    const { row } = renderTree();
    row('Docs').focus();

    await userEvent.keyboard('{ArrowDown}');

    expect(row('Guides').tabIndex).toBe(0);
    expect(row('Docs').tabIndex).toBe(-1);
  });

  it('expands a collapsed folder with Right and enters an expanded one', async () => {
    const { row, onClick } = renderTree();
    row('Notes').focus();

    await userEvent.keyboard('{ArrowRight}');
    row('Docs').focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onClick).toHaveBeenCalledWith('Notes');
    expect(focusedName()).toBe('Guides');
  });

  it('collapses an expanded folder with Left and goes to the parent from inside it', async () => {
    const { row, onClick } = renderTree();
    row('Plan.md').focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedName()).toBe('Docs');
    await userEvent.keyboard('{ArrowLeft}');

    expect(onClick).toHaveBeenCalledWith('Docs');
  });

  it('opens a row with Enter or Space', async () => {
    const { row, onClick } = renderTree();
    row('README.md').focus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onClick.mock.calls).toEqual([['README.md'], ['README.md']]);
  });

  it('jumps to the next row starting with the typed letters', async () => {
    const { row } = renderTree();
    row('Docs').focus();

    await userEvent.keyboard('r');

    expect(focusedName()).toBe('README.md');
  });

  it('matches several letters typed quickly as one prefix', async () => {
    const { row } = renderTree([
      { name: 'Guides', level: 1 },
      { name: 'Glossary.md', level: 1 },
      { name: 'Guide.md', level: 1 },
    ]);
    row('Guides').focus();

    await userEvent.keyboard('gl');

    expect(focusedName()).toBe('Glossary.md');
  });

  it('leaves keys alone that a row already handled', async () => {
    const { row } = renderTree();
    row('Docs').addEventListener('keydown', (event) => event.preventDefault());
    row('Docs').focus();

    await userEvent.keyboard('{ArrowDown}');

    expect(focusedName()).toBe('Docs');
  });

  it('gives the Tab stop to the selected row, or the first row when the Tab stop disappears', async () => {
    const { tree, row, keyboard } = renderTree();
    row('Plan.md').setAttribute('aria-selected', 'true');
    row('Docs').tabIndex = -1;

    row('README.md').focus();
    row('README.md').remove();
    await Promise.resolve();

    expect(row('Plan.md').tabIndex).toBe(0);
    keyboard.destroy();
    expect(tree.isConnected).toBe(true);
  });
});
