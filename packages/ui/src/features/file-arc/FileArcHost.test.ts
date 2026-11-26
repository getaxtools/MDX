import type { FileArcTreeRow, WorkspaceKindId } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { FileArcControls } from './fileArcCommands';
import FileArcHost from './FileArcHost.svelte';
import type { FileArcList } from './FileArcSession';
import type { FileArcWording } from './fileArcText';

const LAZY_LOAD_WAIT = { timeout: 10_000 };
const NOW_MS = new Date(2026, 10, 16, 9).getTime();
const YESTERDAY_EVENING_MS = new Date(2026, 10, 15, 20).getTime();
const PATHS = ['C:\\Handbook\\docs\\getting-started.md', 'C:\\Handbook\\docs\\install.md'];

function list(): FileArcList {
  const children: FileArcTreeRow[] = PATHS.map((path) => {
    const file = InMemoryDocumentFiles.locationOf(path);
    return { label: file.fileName, file };
  });
  return {
    source: {
      roots: [{ label: 'Handbook', children: [{ label: 'docs', children }] }],
      recentFiles: [],
      openTabKeys: new Set(),
    },
    activeKey: InMemoryDocumentFiles.locationOf(PATHS[0] ?? '').canonicalKey,
  };
}

function renderHost(
  readModifiedTime: (path: string) => Promise<number | undefined>,
  {
    wording = 'files',
    kindId = 'markdownViewer',
  }: { wording?: FileArcWording; kindId?: WorkspaceKindId } = {},
) {
  let controls: FileArcControls | undefined;
  render(FileArcHost, {
    wording,
    kindId,
    ctrlWheelAction: 'moveBetweenFiles',
    list,
    translator: createTranslator(),
    onOpen: () => Promise.resolve(),
    onNotice: vi.fn(),
    onFocusDocument: vi.fn(),
    onControls: (handed: FileArcControls) => (controls = handed),
    readModifiedTime,
    nowMs: () => NOW_MS,
  });
  return () => controls?.step('forward');
}

const NO_TIME = () => Promise.resolve(undefined);

describe('FileArcHost', () => {
  it('the card says when the highlighted file was last edited', async () => {
    const read = vi.fn(() => Promise.resolve(YESTERDAY_EVENING_MS));
    const step = renderHost(read);

    step();

    expect(await screen.findByText('Handbook › docs · edited yesterday', {}, LAZY_LOAD_WAIT)).toBeTruthy();
    expect(read).toHaveBeenCalledExactlyOnceWith('C:\\Handbook\\docs\\install.md');
  });

  it('leaves the time out when it cannot be read', async () => {
    const step = renderHost(() => Promise.reject(new Error('unreachable')));

    step();

    expect(await screen.findByText('Handbook › docs', {}, LAZY_LOAD_WAIT)).toBeTruthy();
  });

  it('the notes arc uses note wording', async () => {
    const step = renderHost(NO_TIME, { wording: 'notes', kindId: 'notes' });

    step();
    await screen.findByRole('listbox', { name: 'Switch note' }, LAZY_LOAD_WAIT);
    await fireEvent.keyDown(globalThis.window, { key: 'Escape' });

    expect(screen.getByText('Kept the current note.')).toBeTruthy();
  });
});
