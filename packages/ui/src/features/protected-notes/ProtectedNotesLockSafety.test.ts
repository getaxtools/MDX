import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { SHARED_RENDER_CACHE } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesLocations,
  InMemoryProtectedNotes,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const PASSWORD = 'correct horse battery';
const SECRET_TEXT = 'PIN 4821 for the blue card';

/** One app window showing the Journal Notes workspace, all windows sharing one protected section. */
async function openWindow(protectedNotes: InMemoryProtectedNotes) {
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles(),
    appState: new InMemoryAppState(),
    workspaceStore: new InMemoryWorkspaceStore(),
    kindRegistry: ALL_KINDS_BUILT,
    now: () => 1_000,
    createId: () => `workspace-${String((nextId += 1))}`,
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests(),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    notesLocations: new InMemoryNotesLocations(),
    noteFiles: new InMemoryNoteFiles(),
    protectedNotes,
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  session.updateWorkspaceKinds(() =>
    WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
      ALL_KINDS_BUILT,
    ),
  );
  await controller.execute({
    kind: 'createWorkspace',
    name: 'Journal',
    kindId: 'notes',
    notesLocationPath: JOURNAL,
  });
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  await vi.waitFor(() => expect(snapshot().protectedNotes).toBeDefined());
  return { controller, session, snapshot };
}

async function sectionWithOneNote() {
  const protectedNotes = new InMemoryProtectedNotes();
  await protectedNotes.setUp(JOURNAL, PASSWORD);
  const noteId = await protectedNotes.create(JOURNAL, { title: 'Bank details', folder: '' });
  await protectedNotes.save(JOURNAL, {
    noteId,
    text: SECRET_TEXT,
    encoding: 'utf-8',
    hasByteOrderMark: false,
  });
  return { protectedNotes, noteId, noteKey: `protected:e:\\journal|${noteId}` };
}

async function windowShowingTheNote(protectedNotes: InMemoryProtectedNotes, noteId: string) {
  const opened = await openWindow(protectedNotes);
  await vi.waitFor(() => expect(opened.snapshot().protectedNotes?.state).toBe('unlocked'));
  await opened.controller.execute({ kind: 'openProtectedNote', noteId });
  await vi.waitFor(() => expect(opened.snapshot().activeDocument?.source).toBe(SECRET_TEXT));
  return opened;
}

function isOutsideTheApp(value: object): boolean {
  return value === globalThis || value instanceof globalThis.Node || value instanceof globalThis.Window;
}

function valuesInside(value: object): unknown[] {
  if (value instanceof Map)
    return [...(value as Map<unknown, unknown>).keys(), ...(value as Map<unknown, unknown>).values()];
  if (value instanceof Set) return [...(value as Set<unknown>).values()];
  return Object.values(value as Record<string, unknown>);
}

/**
 * Every string an object holds, through its fields, arrays, maps and sets, but not the DOM, functions,
 * or the given objects, such as the fake that stands in for the encrypted section itself.
 */
function reachableStrings(
  root: unknown,
  { except = [] }: { readonly except?: readonly unknown[] } = {},
): string[] {
  const seen = new Set<unknown>(except);
  const strings: string[] = [];
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') strings.push(value);
    if (typeof value !== 'object' || value === null || seen.has(value) || isOutsideTheApp(value)) continue;
    seen.add(value);
    pending.push(...valuesInside(value));
  }
  return strings;
}

const tabNamesOf = (snapshot: ViewerSnapshot) =>
  snapshot.viewer.tabStrip.tabs().map((tab) => tab.location.fileName);

describe('nothing of a protected note stays after the lock', () => {
  it('leaves no text of the note in the window, its edits or the shared render cache', async () => {
    const { protectedNotes, noteId, noteKey } = await sectionWithOneNote();
    const { controller, snapshot } = await windowShowingTheNote(protectedNotes, noteId);
    await controller.execute({ kind: 'toggleEditing' });
    expect(snapshot().editingMode).toBe('richText');
    controller.updateEditedText(noteKey, `${SECRET_TEXT} and the PUK`);
    SHARED_RENDER_CACHE.set(`table:${noteKey}:| ${SECRET_TEXT} |`, `<td>${SECRET_TEXT}</td>`);
    const heldTexts = () => reachableStrings(controller, { except: [protectedNotes] });
    expect(heldTexts().some((text) => text.includes('4821'))).toBe(true);

    await controller.execute({ kind: 'lockProtectedNotes' });

    expect(heldTexts().filter((text) => text.includes('4821'))).toEqual([]);
    expect(SHARED_RENDER_CACHE.holdsText('4821')).toBe(false);
  });
});

describe('a lock saves the edits of every window first', () => {
  it('a lock from one window saves the unsaved edits of another', async () => {
    const { protectedNotes, noteId, noteKey } = await sectionWithOneNote();
    const first = await windowShowingTheNote(protectedNotes, noteId);
    const second = await windowShowingTheNote(protectedNotes, noteId);
    second.controller.updateEditedText(noteKey, 'PIN 4822');

    await first.controller.execute({ kind: 'lockProtectedNotes' });

    await vi.waitFor(() => expect(tabNamesOf(second.snapshot())).toEqual([]));
    await protectedNotes.unlock(JOURNAL, PASSWORD, false);
    expect((await protectedNotes.open(JOURNAL, noteId)).text).toBe('PIN 4822');
    expect(first.snapshot().protectedNotes?.isAskingToLock).toBeUndefined();
  });

  it('asks before a lock that would lose an edit no window could save, and cancelling keeps it all', async () => {
    const { protectedNotes, noteId, noteKey } = await sectionWithOneNote();
    const first = await windowShowingTheNote(protectedNotes, noteId);
    const second = await windowShowingTheNote(protectedNotes, noteId);
    second.controller.updateEditedText(noteKey, 'PIN 4822');
    vi.spyOn(protectedNotes, 'save').mockRejectedValue(new Error('disk full'));

    await first.controller.execute({ kind: 'lockProtectedNotes' });
    expect(first.snapshot().protectedNotes).toMatchObject({ state: 'unlocked', isAskingToLock: true });
    await first.controller.execute({ kind: 'cancelProtectedLock' });

    expect(first.snapshot().protectedNotes?.isAskingToLock).toBeUndefined();
    expect(tabNamesOf(second.snapshot())).toEqual(['Bank details']);
    expect(second.snapshot().unsavedDocumentKeys.has(noteKey)).toBe(true);
  });

  it('locks anyway when the user chooses it, and the window that lost edits says so', async () => {
    const { protectedNotes, noteId, noteKey } = await sectionWithOneNote();
    const first = await windowShowingTheNote(protectedNotes, noteId);
    const second = await windowShowingTheNote(protectedNotes, noteId);
    second.controller.updateEditedText(noteKey, 'PIN 4822');
    vi.spyOn(protectedNotes, 'save').mockRejectedValue(new Error('disk full'));
    await first.controller.execute({ kind: 'lockProtectedNotes' });

    await first.controller.execute({ kind: 'confirmProtectedLock' });

    await vi.waitFor(() => expect(tabNamesOf(second.snapshot())).toEqual([]));
    expect(first.snapshot().protectedNotes?.state).toBe('locked');
    expect(second.snapshot().notice).toBe(
      'Some edits to protected notes could not be saved before the section locked.',
    );
  });

  it('locking every section, as on sleep, saves every window first', async () => {
    const { protectedNotes, noteId, noteKey } = await sectionWithOneNote();
    const shown = await windowShowingTheNote(protectedNotes, noteId);
    shown.controller.updateEditedText(noteKey, 'PIN 4823');

    await protectedNotes.lockAll();

    await vi.waitFor(() => expect(tabNamesOf(shown.snapshot())).toEqual([]));
    await protectedNotes.unlock(JOURNAL, PASSWORD, false);
    expect((await protectedNotes.open(JOURNAL, noteId)).text).toBe('PIN 4823');
  });
});

describe('a protected note is never copied as HTML, and exported or printed only once the user accepts', () => {
  it('refuses Copy as HTML with a notice', async () => {
    const { protectedNotes, noteId } = await sectionWithOneNote();
    const { controller, snapshot } = await windowShowingTheNote(protectedNotes, noteId);

    await controller.execute({ kind: 'copyAsHtml' });

    expect(snapshot().notice).toBe('Protected notes cannot be copied as HTML yet.');
    expect(snapshot().copyAsHtmlRequest ?? 0).toBe(0);
  });

  it.each([
    { command: { kind: 'exportDocument', format: 'html' }, dialog: 'protectedExportWarning' },
    { command: { kind: 'exportDocument', format: 'plainText' }, dialog: 'protectedExportWarning' },
    { command: { kind: 'print' }, dialog: 'protectedPrintWarning' },
  ] as const)('asks before $command.kind and starts nothing yet', async ({ command, dialog }) => {
    const { protectedNotes, noteId } = await sectionWithOneNote();
    const { controller, snapshot } = await windowShowingTheNote(protectedNotes, noteId);

    await controller.execute(command);

    expect(snapshot().openDialog).toBe(dialog);
    expect(snapshot().exportRequest).toBeUndefined();
    expect(snapshot().printRequest ?? 0).toBe(0);
  });
});

describe('a recovery key not confirmed yet', () => {
  async function setUpWithoutConfirming() {
    const protectedNotes = new InMemoryProtectedNotes();
    const opened = await openWindow(protectedNotes);
    await opened.controller.execute({ kind: 'showProtectedSetUp' });
    await opened.controller.execute({ kind: 'setUpProtectedSection', password: PASSWORD });
    const recoveryKey = opened.snapshot().protectedNotes?.recoveryKey;
    return { ...opened, protectedNotes, recoveryKey };
  }

  it('is covered while the section is locked and shown again once it is unlocked', async () => {
    const { controller, snapshot, recoveryKey } = await setUpWithoutConfirming();

    await controller.execute({ kind: 'lockProtectedNotes' });
    expect(snapshot().protectedNotes).toMatchObject({ state: 'locked', isRecoveryKeyCovered: true });
    expect(snapshot().protectedNotes?.recoveryKey).toBeUndefined();
    expect(reachableStrings(snapshot()).includes(recoveryKey ?? '?')).toBe(false);
    await controller.execute({ kind: 'unlockProtectedSection', password: PASSWORD, shouldRemember: false });

    expect(snapshot().protectedNotes?.recoveryKey).toBe(recoveryKey);
    expect(snapshot().openDialog).toBe('protectedSetUp');
    await controller.execute({ kind: 'finishProtectedSetUp' });
    expect(snapshot().protectedNotes?.recoveryKey).toBeUndefined();
  });

  it('cannot be confirmed while the section is locked', async () => {
    const { controller, snapshot } = await setUpWithoutConfirming();
    await controller.execute({ kind: 'lockProtectedNotes' });

    await controller.execute({ kind: 'finishProtectedSetUp' });

    expect(snapshot().protectedNotes?.isRecoveryKeyCovered).toBe(true);
  });

  it('is not dropped when another workspace is shown: the user is warned and finds it on coming back', async () => {
    const { controller, snapshot, recoveryKey } = await setUpWithoutConfirming();

    await controller.execute({ kind: 'createWorkspace', name: 'Docs', kindId: 'markdownViewer' });
    await vi.waitFor(() => expect(snapshot().protectedNotes).toBeUndefined());
    expect(snapshot().notice).toContain('its recovery key still has to be confirmed');
    expect(snapshot().openDialog).toBeUndefined();
    const journalId = snapshot()
      .workspaces?.registry.workspaces()
      .find((workspace) => workspace.name === 'Journal')?.id;
    await controller.execute({ kind: 'switchWorkspace', workspaceId: journalId ?? '' });

    await vi.waitFor(() => expect(snapshot().protectedNotes?.recoveryKey).toBe(recoveryKey));
    expect(snapshot().openDialog).toBe('protectedSetUp');
  });
});
