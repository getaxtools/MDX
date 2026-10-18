import { TabStrip } from '@mdx/core';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { applyTabCommand, isTabCommand } from './tabCommands';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const keyOf = (path: string) => location(path).canonicalKey;

function stripWith(...paths: string[]) {
  return paths.reduce((strip, path) => strip.openOrFocus(location(path)), TabStrip.empty());
}

const namesOf = (tabStrip: TabStrip) => tabStrip.tabs().map((tab) => tab.location.fileName);

describe('tab commands', () => {
  it('closes a chosen tab, the others, or those to its right', () => {
    const tabStrip = stripWith('a.md', 'b.md', 'c.md');

    expect(namesOf(applyTabCommand(tabStrip, { kind: 'closeTab', canonicalKey: keyOf('b.md') }))).toEqual([
      'a.md',
      'c.md',
    ]);
    expect(
      namesOf(applyTabCommand(tabStrip, { kind: 'closeOtherTabs', canonicalKey: keyOf('b.md') })),
    ).toEqual(['b.md']);
    expect(
      namesOf(applyTabCommand(tabStrip, { kind: 'closeTabsToTheRight', canonicalKey: keyOf('a.md') })),
    ).toEqual(['a.md']);
  });

  it('closes the tabs other than, or to the right of, the active tab', () => {
    const tabStrip = stripWith('a.md', 'b.md', 'c.md').activate(keyOf('b.md'));

    expect(namesOf(applyTabCommand(tabStrip, { kind: 'closeInactiveTabs' }))).toEqual(['b.md']);
    expect(namesOf(applyTabCommand(tabStrip, { kind: 'closeTabsRightOfActive' }))).toEqual(['a.md', 'b.md']);
  });

  it('pins and unpins the active tab', () => {
    const tabStrip = stripWith('a.md', 'b.md');

    const pinned = applyTabCommand(tabStrip, { kind: 'togglePinActiveTab' });
    const unpinned = applyTabCommand(pinned, { kind: 'togglePinActiveTab' });

    expect(pinned.tabs().map((tab) => [tab.location.fileName, tab.isPinned])).toEqual([
      ['b.md', true],
      ['a.md', false],
    ]);
    expect(unpinned.tabs().every((tab) => !tab.isPinned)).toBe(true);
  });

  it('pins a tab to the front and unpins it again', () => {
    const tabStrip = stripWith('a.md', 'b.md');

    const pinned = applyTabCommand(tabStrip, { kind: 'pinTab', canonicalKey: keyOf('b.md') });
    const unpinned = applyTabCommand(pinned, { kind: 'unpinTab', canonicalKey: keyOf('b.md') });

    expect(namesOf(pinned)).toEqual(['b.md', 'a.md']);
    expect(pinned.tabs()[0]?.isPinned).toBe(true);
    expect(unpinned.tabs().some((tab) => tab.isPinned)).toBe(false);
  });

  it('moves a tab to a new position', () => {
    const tabStrip = stripWith('a.md', 'b.md', 'c.md');

    const moved = applyTabCommand(tabStrip, { kind: 'moveTab', canonicalKey: keyOf('c.md'), toIndex: 0 });

    expect(namesOf(moved)).toEqual(['c.md', 'a.md', 'b.md']);
  });

  it('moves the active tab one place left or right', () => {
    const tabStrip = stripWith('a.md', 'b.md', 'c.md').activate(keyOf('b.md'));

    expect(namesOf(applyTabCommand(tabStrip, { kind: 'moveActiveTab', step: -1 }))).toEqual([
      'b.md',
      'a.md',
      'c.md',
    ]);
    expect(namesOf(applyTabCommand(tabStrip, { kind: 'moveActiveTab', step: 1 }))).toEqual([
      'a.md',
      'c.md',
      'b.md',
    ]);
  });

  it('leaves an empty tab strip unchanged', () => {
    const empty = TabStrip.empty();

    expect(applyTabCommand(empty, { kind: 'moveActiveTab', step: 1 })).toBe(empty);
    expect(applyTabCommand(empty, { kind: 'closeActiveTab' })).toBe(empty);
  });

  it('tells tab commands apart from other commands', () => {
    expect(isTabCommand({ kind: 'pinTab' })).toBe(true);
    expect(isTabCommand({ kind: 'zoomIn' })).toBe(false);
  });
});
