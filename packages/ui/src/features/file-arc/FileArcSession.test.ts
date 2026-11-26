import type { FileArcTreeRow } from '@mdx/core';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { FileArcSession, type FileArcEnd, type FileArcList, type ShownFileArc } from './FileArcSession';

const NOTCH = { deltaY: 100, deltaMode: 0 };
const PAGE_HEIGHT_PX = 800;

function fileRow(path: string): FileArcTreeRow {
  const file = InMemoryDocumentFiles.locationOf(path);
  return { label: file.fileName, file };
}

function listOf(paths: readonly string[], activePath?: string): () => FileArcList {
  return () => ({
    source: {
      roots: [{ label: 'Docs', children: paths.map(fileRow) }],
      recentFiles: [],
      openTabKeys: new Set(),
    },
    activeKey:
      activePath === undefined ? undefined : InMemoryDocumentFiles.locationOf(activePath).canonicalKey,
  });
}

function createSession() {
  const changes: (ShownFileArc | undefined)[] = [];
  const ends: FileArcEnd[] = [];
  const onOpen = vi.fn();
  const onEmpty = vi.fn();
  const session = new FileArcSession({
    onChange: (shown) => changes.push(shown),
    onOpen,
    onEnd: (end) => ends.push(end),
    onEmpty,
  });
  const highlightedName = () => {
    const shown = session.shown;
    return shown?.entries[shown.highlighted]?.name;
  };
  return { session, changes, ends, onOpen, onEmpty, highlightedName };
}

const GUIDE_FILES = ['C:\\Docs\\README.md', 'C:\\Docs\\getting-started.md', 'C:\\Docs\\install.md'];

describe('FileArcSession', () => {
  it('opens one step from the active document in either direction', () => {
    const forward = createSession();
    forward.session.step('forward', listOf(GUIDE_FILES, 'C:\\Docs\\getting-started.md'));
    const back = createSession();
    back.session.step('back', listOf(GUIDE_FILES, 'C:\\Docs\\getting-started.md'));

    expect(forward.highlightedName()).toBe('install.md');
    expect(back.highlightedName()).toBe('README.md');
  });

  it('starts at the first entry going forward and the last going back when the active document is not listed', () => {
    const forward = createSession();
    forward.session.step('forward', listOf(GUIDE_FILES, 'C:\\Elsewhere\\notes.md'));
    const back = createSession();
    back.session.step('back', listOf(GUIDE_FILES));

    expect(forward.highlightedName()).toBe('README.md');
    expect(back.highlightedName()).toBe('install.md');
  });

  it('moves one entry a step and wraps past either end', () => {
    const { session, highlightedName } = createSession();
    const list = listOf(GUIDE_FILES, 'C:\\Docs\\getting-started.md');

    session.step('forward', list);
    session.step('forward', list);

    expect(highlightedName()).toBe('README.md');
    session.step('back', list);
    expect(highlightedName()).toBe('install.md');
  });

  it('reads the list once, when it opens', () => {
    const { session } = createSession();
    const list = vi.fn(listOf(GUIDE_FILES));

    session.step('forward', list);
    session.step('forward', list);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('an empty list explains itself instead of opening', () => {
    const { session, onEmpty, changes } = createSession();

    session.step('forward', listOf(['C:\\Docs\\README.md'], 'C:\\Docs\\README.md'));

    expect(onEmpty).toHaveBeenCalledOnce();
    expect(changes).toEqual([]);
  });

  it('one notch of the wheel moves exactly one entry', () => {
    const { session, highlightedName } = createSession();
    const list = listOf(GUIDE_FILES, 'C:\\Docs\\README.md');

    session.turnWheel(NOTCH, PAGE_HEIGHT_PX, list);
    session.turnWheel(NOTCH, PAGE_HEIGHT_PX, list);

    expect(highlightedName()).toBe('install.md');
  });

  it('a small touchpad scroll does not skip entries', () => {
    const { session, highlightedName } = createSession();
    const list = listOf(GUIDE_FILES, 'C:\\Docs\\README.md');

    for (let event = 0; event < 4; event += 1)
      session.turnWheel({ deltaY: 10, deltaMode: 0 }, PAGE_HEIGHT_PX, list);
    expect(session.shown).toBeUndefined();
    session.turnWheel({ deltaY: 30, deltaMode: 0 }, PAGE_HEIGHT_PX, list);

    expect(highlightedName()).toBe('getting-started.md');
  });

  it('forgets wheel movement that never added up to a step', () => {
    const { session } = createSession();
    const list = listOf(GUIDE_FILES);
    session.turnWheel({ deltaY: 40, deltaMode: 0 }, PAGE_HEIGHT_PX, list);

    session.forgetWheelMovement();
    session.turnWheel({ deltaY: 40, deltaMode: 0 }, PAGE_HEIGHT_PX, list);

    expect(session.shown).toBeUndefined();
  });

  it('letting go opens the highlighted entry and closes the arc', () => {
    const { session, onOpen, ends, changes } = createSession();
    session.step('forward', listOf(GUIDE_FILES, 'C:\\Docs\\README.md'));

    session.choose();

    expect(onOpen).toHaveBeenCalledWith(InMemoryDocumentFiles.locationOf('C:\\Docs\\getting-started.md'));
    expect(ends.map((end) => end.kind)).toEqual(['opened']);
    expect(changes.at(-1)).toBeUndefined();
  });

  it('a click opens the clicked entry rather than the highlighted one', () => {
    const { session, onOpen } = createSession();
    session.step('forward', listOf(GUIDE_FILES, 'C:\\Docs\\README.md'));

    session.choose(2);

    expect(onOpen).toHaveBeenCalledWith(InMemoryDocumentFiles.locationOf('C:\\Docs\\install.md'));
  });

  it('letting go on the active file changes nothing', () => {
    const { session, onOpen, ends } = createSession();
    const list = listOf(GUIDE_FILES, 'C:\\Docs\\README.md');
    session.step('forward', list);
    session.step('back', list);

    session.choose();

    expect(onOpen).not.toHaveBeenCalled();
    expect(ends).toEqual([{ kind: 'kept' }]);
  });

  it('esc keeps the current file, and letting go afterwards opens nothing', () => {
    const { session, onOpen, ends } = createSession();
    session.step('forward', listOf(GUIDE_FILES, 'C:\\Docs\\README.md'));

    session.cancel();
    session.choose();

    expect(onOpen).not.toHaveBeenCalled();
    expect(ends).toEqual([{ kind: 'kept' }]);
  });
});
