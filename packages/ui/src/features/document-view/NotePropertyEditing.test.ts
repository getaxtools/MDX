import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  type EditedDocumentSave,
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentLinks,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesLocations,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const PLAN = 'E:\\Journal\\Plan.md';
const PLAN_KEY = PLAN.toLowerCase();
const PLAN_TEXT = '---\r\nstatus: draft\r\nowner: Ana\r\ntags: [work, q4]\r\n---\r\n\r\n# Plan\r\n';

/** Files whose saves finish only once the test lets them, like a slow network share. */
class SlowlySavedFiles extends InMemoryDocumentFiles {
  private readonly waitingSaves: (() => void)[] = [];

  override save(document: EditedDocumentSave): Promise<number> {
    return new Promise<void>((resolve) => this.waitingSaves.push(resolve)).then(() => super.save(document));
  }

  hasWaitingSave(): boolean {
    return this.waitingSaves.length > 0;
  }

  finishSaves(): void {
    for (const finish of this.waitingSaves.splice(0)) finish();
  }
}

/** Lets the saves finish once one has reached the files, which takes a few turns of the event loop. */
async function waitForSaves(files: SlowlySavedFiles | undefined): Promise<void> {
  while (files && !files.hasWaitingSave()) await new Promise((resolve) => setTimeout(resolve, 0));
  files?.finishSaves();
}

async function startInJournal(
  notes: Readonly<Record<string, string>> = { [PLAN]: PLAN_TEXT },
  createFiles: (texts: Readonly<Record<string, string>>) => InMemoryDocumentFiles = (texts) =>
    new InMemoryDocumentFiles(texts),
) {
  const documentFiles = createFiles({
    ...notes,
    'E:\\Elsewhere\\Readme.md': '---\nstatus: x\n---\n',
  });
  const noteFiles = new InMemoryNoteFiles({ folders: [], notes: Object.keys(notes) });
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles,
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
    links: new InMemoryDocumentLinks(),
    notesLocations: new InMemoryNotesLocations(),
    noteFiles,
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
  await controller.openDocuments([Object.keys(notes)[0] ?? PLAN]);
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, documentFiles, session, snapshot };
}

describe('editing note properties', () => {
  it('a note with simple front matter gets a field for each property', async () => {
    const { snapshot } = await startInJournal();

    expect(snapshot().activeDocument?.propertiesEditability).toEqual({
      kind: 'fields',
      properties: [
        { key: 'status', kind: 'value', value: 'draft' },
        { key: 'owner', kind: 'value', value: 'Ana' },
        { key: 'tags', kind: 'list', values: ['work', 'q4'] },
      ],
    });
  });

  it('a note with complex front matter is edited in the note', async () => {
    const { snapshot } = await startInJournal({ [PLAN]: '---\nowner:\n  name: Ana\n---\n# Plan\n' });

    expect(snapshot().activeDocument?.propertiesEditability).toEqual({ kind: 'inNote' });
  });

  it('documents outside the Notes workspace only show their properties', async () => {
    const { controller, snapshot } = await startInJournal();

    await controller.openDocuments(['E:\\Elsewhere\\Readme.md']);

    expect(snapshot().activeDocument?.frontMatter).toBe('status: x');
    expect(snapshot().activeDocument?.propertiesEditability).toBeUndefined();
  });

  it('editing one value changes only its bytes, keeping CRLF', async () => {
    const { controller, documentFiles, snapshot } = await startInJournal();

    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'status', value: 'done' },
    });

    expect(documentFiles.textOf(PLAN)).toBe(PLAN_TEXT.replace('draft', 'done'));
    expect(snapshot().unsavedDocumentKeys.size).toBe(0);
    expect(snapshot().activeDocument?.propertiesEditability).toMatchObject({
      properties: [{ key: 'status', kind: 'value', value: 'done' }, {}, {}],
    });
  });

  it('a note with mixed line breaks keeps each line its own break', async () => {
    const mixed = '---\nstatus: draft\r\nowner: Ana\r---\n# Plan\r\n';
    const { controller, documentFiles } = await startInJournal({ [PLAN]: mixed });

    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setList', key: 'owner', values: ['Ana', 'Bo'] },
    });

    expect(documentFiles.textOf(PLAN)).toBe('---\nstatus: draft\r\nowner: [Ana, Bo]\r---\n# Plan\r\n');
  });

  it('edits are refused while the note has unsaved changes, and work again once it is saved', async () => {
    const { controller, documentFiles, snapshot } = await startInJournal();
    const edit = { kind: 'setValue', key: 'status', value: 'done' } as const;
    controller.updateEditedText(PLAN_KEY, `${PLAN_TEXT.replaceAll('\r\n', '\n')}More.\n`);

    await controller.execute({ kind: 'editProperty', canonicalKey: PLAN_KEY, edit });

    expect(snapshot().notice).toBe('Plan.md has unsaved changes. Save it before changing its properties.');
    expect(documentFiles.textOf(PLAN)).toBe(PLAN_TEXT);

    await controller.execute({ kind: 'saveDocument' });
    await controller.execute({ kind: 'editProperty', canonicalKey: PLAN_KEY, edit });

    expect(documentFiles.textOf(PLAN)).toBe(`${PLAN_TEXT.replace('draft', 'done')}More.\r\n`);
  });

  it('a note changed on disk is not overwritten, and the change waits as unsaved', async () => {
    const { controller, documentFiles, snapshot } = await startInJournal();
    documentFiles.write(PLAN, '---\nstatus: blocked\n---\n');

    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'status', value: 'done' },
    });

    expect(documentFiles.textOf(PLAN)).toBe('---\nstatus: blocked\n---\n');
    expect(snapshot().unsavedDocumentKeys.has(PLAN_KEY)).toBe(true);
    expect(snapshot().noticeActions?.map((action) => action.command.kind)).toEqual([
      'overwriteChangesOnDisk',
      'reloadFromDisk',
    ]);
  });

  it('complex front matter is refused with a notice', async () => {
    const complex = '---\nowner:\n  name: Ana\n---\n';
    const { controller, documentFiles, snapshot } = await startInJournal({ [PLAN]: complex });

    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'owner', value: 'Bo' },
    });

    expect(documentFiles.textOf(PLAN)).toBe(complex);
    expect(snapshot().notice).toBe('The properties of Plan.md can only be changed in the note’s text.');
  });

  it('a property the note does not have is not added', async () => {
    const { controller, documentFiles, snapshot } = await startInJournal();

    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'due', value: 'Friday' },
    });

    expect(documentFiles.textOf(PLAN)).toBe(PLAN_TEXT);
    expect(snapshot().notice).toBe('The properties of Plan.md can only be changed in the note’s text.');
  });

  it('the editor gets the new value before a slow save ends, so text typed meanwhile keeps it', async () => {
    const slowFiles: SlowlySavedFiles[] = [];
    const { controller, snapshot } = await startInJournal(undefined, (texts) => {
      slowFiles.push(new SlowlySavedFiles(texts));
      return slowFiles[0] ?? new InMemoryDocumentFiles(texts);
    });
    await controller.execute({ kind: 'toggleEditing' });
    const doneText = PLAN_TEXT.replace('draft', 'done').replaceAll('\r\n', '\n');

    const editing = controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'status', value: 'done' },
    });
    expect(snapshot().editorRequest).toMatchObject({ kind: 'replaceText', text: doneText });
    controller.updateEditedText(PLAN_KEY, `${doneText}Typed.\n`);
    await waitForSaves(slowFiles[0]);
    await editing;
    const saving = controller.execute({ kind: 'saveDocument' });
    await waitForSaves(slowFiles[0]);
    await saving;

    expect(slowFiles[0]?.textOf(PLAN)).toBe(`${PLAN_TEXT.replace('draft', 'done')}Typed.\r\n`);
    expect(snapshot().unsavedDocumentKeys.size).toBe(0);
  });

  it('while a property is written its note is marked as saving, and a second edit waits its turn', async () => {
    const slowFiles: SlowlySavedFiles[] = [];
    const { controller, snapshot } = await startInJournal(undefined, (texts) => {
      slowFiles.push(new SlowlySavedFiles(texts));
      return slowFiles[0] ?? new InMemoryDocumentFiles(texts);
    });

    const editing = controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'status', value: 'done' },
    });
    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'owner', value: 'Bo' },
    });
    const savingKeyDuringSave = snapshot().propertySavingKey;
    await waitForSaves(slowFiles[0]);
    await editing;

    expect(savingKeyDuringSave).toBe(PLAN_KEY);
    expect(snapshot().propertySavingKey).toBeUndefined();
    expect(snapshot().notice).toBeUndefined();
    expect(slowFiles[0]?.textOf(PLAN)).toBe(PLAN_TEXT.replace('draft', 'done'));
  });

  it('an open editor without changes shows the saved text', async () => {
    const { controller, snapshot } = await startInJournal();
    await controller.execute({ kind: 'toggleEditing' });

    await controller.execute({
      kind: 'editProperty',
      canonicalKey: PLAN_KEY,
      edit: { kind: 'setValue', key: 'status', value: 'done' },
    });

    expect(snapshot().editorRequest).toMatchObject({
      kind: 'replaceText',
      text: PLAN_TEXT.replace('draft', 'done').replaceAll('\r\n', '\n'),
    });
  });

  it('Edit in Note opens the note in the editor at its start', async () => {
    const { controller, session, snapshot } = await startInJournal();
    controller.rememberScrollPosition(0.5);

    await controller.execute({ kind: 'editPropertiesInNote' });

    expect(snapshot().isActiveDocumentEditing).toBe(true);
    expect(session.currentState().tabStrip.activeTab()?.scrollRatio).toBe(0);
  });

  it('Edit in Note moves an open editor to the first line', async () => {
    const { controller, snapshot } = await startInJournal();
    await controller.execute({ kind: 'toggleEditing' });

    await controller.execute({ kind: 'editPropertiesInNote' });

    expect(snapshot().editorRequest).toMatchObject({ kind: 'revealLine', canonicalKey: PLAN_KEY, line: 0 });
  });
});
