import { notesLocationOf, ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesIndex,
  InMemoryNotesLocations,
  InMemoryWorkspaceStore,
  type AppliedLinkUpdates,
  type DocumentLocation,
  type LinkUpdatePlan,
  type LinkUpdatesToApply,
  type NoteLinkUpdates,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const TEXTS: Readonly<Record<string, string>> = {
  'E:\\Journal\\Draft.md': '# Draft\n\n## Goals\n',
  'E:\\Journal\\Inbox.md': '# Inbox\n\nSee [[Draft]] and [[Draft#Goals]].\n',
  'E:\\Journal\\Projects\\Work.md': 'Café: [[Draft]]\n',
};

/** Note files whose next link update fails as a whole, as when the folder cannot be reached. */
class FailingNoteFiles extends InMemoryNoteFiles {
  failsNextLinkUpdate = false;

  override applyLinkUpdates(updates: LinkUpdatesToApply): Promise<AppliedLinkUpdates> {
    if (!this.failsNextLinkUpdate) return super.applyLinkUpdates(updates);
    this.failsNextLinkUpdate = false;
    return Promise.reject(new Error('the folder cannot be reached'));
  }
}

async function startInJournal({ isIndexBuilt = true }: { readonly isIndexBuilt?: boolean } = {}) {
  const documentFiles = new InMemoryDocumentFiles(TEXTS);
  const noteFiles = new FailingNoteFiles({ folders: ['E:\\Journal\\Projects'], texts: TEXTS });
  const notesIndex = new InMemoryNotesIndex();
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
    notesLocations: new InMemoryNotesLocations(),
    noteFiles,
    notesIndex,
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
  const shown = session.shownWorkspace();
  const locationId = shown ? notesLocationOf(shown)?.locationId : undefined;
  if (isIndexBuilt && locationId !== undefined)
    notesIndex.sendStatus({
      locationId,
      indexed: 3,
      toIndex: 3,
      isBuilding: false,
      wasRebuilt: false,
      isWatched: true,
    });
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, session, noteFiles, notesIndex, snapshot };
}

/** The plan the index makes for a rename of Draft: every `[[Draft` target in the note becomes `name`. */
function renamePlanFor(noteFiles: InMemoryNoteFiles, notePath: string, name: string): NoteLinkUpdates {
  const text = noteFiles.textOf(`${JOURNAL}\\${notePath.replaceAll('/', '\\')}`) ?? '';
  const bytesBefore = (index: number) => new TextEncoder().encode(text.slice(0, index)).length;
  const starts = [...text.matchAll(/\[\[Draft/gu)].map((match) => bytesBefore(match.index + 2));
  return {
    path: notePath,
    pathOnceUndone: notePath,
    contentHash: InMemoryNoteFiles.contentHashOf(text),
    edits: starts.map((start) => ({ start, end: start + 'Draft'.length, before: 'Draft', after: name })),
    lines: text
      .split('\n')
      .map((line, index) => ({
        lineNumber: index + 1,
        before: line,
        after: line.replaceAll('[[Draft', `[[${name}`),
      }))
      .filter((line) => line.before !== line.after),
  };
}

function planRenamingDraftTo(noteFiles: InMemoryNoteFiles, name: string): LinkUpdatePlan {
  return {
    notes: [renamePlanFor(noteFiles, 'Inbox.md', name), renamePlanFor(noteFiles, 'Projects/Work.md', name)],
    notUpdated: [],
  };
}

const DRAFT: DocumentLocation = InMemoryDocumentFiles.locationOf('E:\\Journal\\Draft.md');

async function renameDraftToPlan(controller: ViewerController): Promise<void> {
  await controller.execute({ kind: 'renameNote', note: DRAFT, name: 'Plan' });
}

describe('links follow a renamed note', () => {
  it('shows the links a rename would change, grouped by note, before changing any', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));

    await renameDraftToPlan(controller);

    expect(notesIndex.plannedMoves).toEqual([{ from: 'Draft.md', to: 'Plan.md' }]);
    expect(snapshot().openDialog).toBe('noteLinkUpdates');
    expect(snapshot().notes?.linkUpdates).toEqual({
      noteName: 'Plan',
      linkCount: 3,
      noteCount: 2,
      notes: [
        {
          path: 'Inbox.md',
          name: 'Inbox',
          folder: '',
          lines: [
            {
              lineNumber: 3,
              before: 'See [[Draft]] and [[Draft#Goals]].',
              after: 'See [[Plan]] and [[Plan#Goals]].',
            },
          ],
        },
        {
          path: 'Projects/Work.md',
          name: 'Work',
          folder: 'Projects',
          lines: [{ lineNumber: 1, before: 'Café: [[Draft]]', after: 'Café: [[Plan]]' }],
        },
      ],
      hiddenLineCount: 0,
      leftNotes: [],
      mayMissLinks: false,
      hasExcludedPaths: false,
    });
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
  });

  it('updating changes only the links, and one Undo restores the name and the links', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    await controller.openDocuments(['E:\\Journal\\Draft.md']);
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);

    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });
    expect(snapshot().openDialog).toBeUndefined();
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe('# Inbox\n\nSee [[Plan]] and [[Plan#Goals]].\n');
    expect(noteFiles.textOf('E:\\Journal\\Projects\\Work.md')).toBe('Café: [[Plan]]\n');
    expect(snapshot().notice).toBe('Updated 3 links in 2 notes.');
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');
    await controller.runNoticeAction(undo);

    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Draft.md');
    expect(noteFiles.notePaths()).not.toContain('E:\\Journal\\Plan.md');
    for (const [path, text] of Object.entries(TEXTS)) expect(noteFiles.textOf(path)).toBe(text);
    expect(snapshot().viewer.tabStrip.activeTab()?.location.displayPath).toBe('E:\\Journal\\Draft.md');
    expect(snapshot().notice).toBe('Draft has its old name and place again, and its links are as they were.');
  });

  it('Don’t Update leaves every link as it is', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);

    await controller.execute({ kind: 'skipNoteLinkUpdates' });

    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().notes?.linkUpdates).toBeUndefined();
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Plan.md');
  });

  it('choosing Always in the preview updates without asking from then on, with Undo still offered', async () => {
    const { controller, noteFiles, notesIndex, session, snapshot } = await startInJournal();
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: true });
    expect(session.currentState().viewSettings.isNoteLinkUpdateConfirmed).toBe(false);
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');
    await controller.runNoticeAction(undo);

    await renameDraftToPlan(controller);

    expect(snapshot().openDialog).toBeUndefined();
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe('# Inbox\n\nSee [[Plan]] and [[Plan#Goals]].\n');
    expect(snapshot().notice).toBe('Updated 3 links in 2 notes.');
    expect(snapshot().noticeActions?.map((action) => action.label)).toEqual(['Undo']);
  });

  it('a linking note with unsaved changes keeps its links and is listed as left', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    await controller.openDocuments(['E:\\Journal\\Inbox.md']);
    controller.updateEditedText('e:\\journal\\inbox.md', '# Inbox, edited');
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);

    expect(snapshot().notes?.linkUpdates?.leftNotes).toEqual([
      { path: 'Inbox.md', name: 'Inbox', folder: '', reason: 'unsaved' },
    ]);
    expect(snapshot().notes?.linkUpdates?.notes.map((note) => note.name)).toEqual(['Work']);
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });

    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
    expect(noteFiles.textOf('E:\\Journal\\Projects\\Work.md')).toBe('Café: [[Plan]]\n');
    expect(snapshot().notice).toBe('Updated 1 link in 1 note. 1 note has links left as they were.');
  });

  it('a note that changed after the plan keeps its links and is counted', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    const plan = planRenamingDraftTo(noteFiles, 'Plan');
    const [inbox, work] = plan.notes;
    if (!inbox || !work) throw new Error('no plan');
    notesIndex.linkUpdatePlans.set('Draft.md', {
      ...plan,
      notes: [{ ...inbox, contentHash: 'older' }, work],
    });
    await renameDraftToPlan(controller);

    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });

    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
    expect(snapshot().notice).toBe('Updated 1 link in 1 note. 1 note has links left as they were.');
  });

  it('a move with no links to change asks nothing', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();

    await controller.execute({ kind: 'moveNote', note: DRAFT, into: 'E:\\Journal\\Projects' });

    expect(notesIndex.plannedMoves).toEqual([{ from: 'Draft.md', to: 'Projects/Draft.md' }]);
    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Projects\\Draft.md');
    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().notice).toBeUndefined();
  });

  it('Undo after a move puts the note back in its folder', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    const inbox = renamePlanFor(noteFiles, 'Inbox.md', 'Projects/Draft');
    notesIndex.linkUpdatePlans.set('Draft.md', { notes: [inbox], notUpdated: [] });
    await controller.execute({ kind: 'moveNote', note: DRAFT, into: 'E:\\Journal\\Projects' });
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');

    await controller.runNoticeAction(undo);

    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Draft.md');
    expect(noteFiles.notePaths()).not.toContain('E:\\Journal\\Projects\\Draft.md');
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
  });

  it('a note edited while the preview is open keeps its links', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    await controller.openDocuments(['E:\\Journal\\Inbox.md']);
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);
    expect(snapshot().notes?.linkUpdates?.leftNotes).toEqual([]);

    controller.updateEditedText('e:\\journal\\inbox.md', '# Inbox, edited');
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });

    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
    expect(noteFiles.textOf('E:\\Journal\\Projects\\Work.md')).toBe('Café: [[Plan]]\n');
    expect(snapshot().notice).toBe('Updated 1 link in 1 note. 1 note has links left as they were.');
  });

  it('links the index could not change are listed with their folder and counted', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    notesIndex.linkUpdatePlans.set('Draft.md', {
      ...planRenamingDraftTo(noteFiles, 'Plan'),
      notUpdated: [{ path: 'Projects/Ideas.md', reason: 'notChangeableInPlace' }],
    });
    await renameDraftToPlan(controller);

    expect(snapshot().notes?.linkUpdates?.leftNotes).toEqual([
      { path: 'Projects/Ideas.md', name: 'Ideas', folder: 'Projects', reason: 'notChangeableInPlace' },
    ]);
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });

    expect(snapshot().notice).toBe('Updated 3 links in 2 notes. 1 note has links left as they were.');
  });

  it('while the index is still being built, the preview and the notice say links may be missing', async () => {
    const { controller, noteFiles, notesIndex, session, snapshot } = await startInJournal({
      isIndexBuilt: false,
    });
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);
    expect(snapshot().notes?.linkUpdates?.mayMissLinks).toBe(true);
    await controller.execute({ kind: 'skipNoteLinkUpdates' });
    session.updateViewSettings((settings) => ({ ...settings, isNoteLinkUpdateConfirmed: false }));
    const plan = InMemoryDocumentFiles.locationOf('E:\\Journal\\Plan.md');

    await controller.execute({ kind: 'renameNote', note: plan, name: 'Draft' });
    await controller.execute({ kind: 'renameNote', note: DRAFT, name: 'Plan' });

    expect(snapshot().notice).toBe(
      'Updated 3 links in 2 notes. Some links may not be found yet, as your notes are still being indexed.',
    );
  });

  it('the preview shows the first 200 changed lines and counts the rest', async () => {
    const { controller, notesIndex, snapshot } = await startInJournal();
    const lines = Array.from({ length: 205 }, (_, index) => ({
      lineNumber: index + 1,
      before: '[[Draft]]',
      after: '[[Plan]]',
    }));
    notesIndex.linkUpdatePlans.set('Draft.md', {
      notes: [{ path: 'Inbox.md', pathOnceUndone: 'Inbox.md', contentHash: 'any', edits: [], lines }],
      notUpdated: [],
    });

    await renameDraftToPlan(controller);

    expect(snapshot().notes?.linkUpdates?.notes[0]?.lines).toHaveLength(200);
    expect(snapshot().notes?.linkUpdates?.hiddenLineCount).toBe(5);
  });

  it('Undo is refused while the moved note has unsaved changes, and works once it is saved', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    await controller.openDocuments(['E:\\Journal\\Draft.md']);
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');
    controller.updateEditedText('e:\\journal\\plan.md', '# Plan, edited');

    await controller.runNoticeAction(undo);

    expect(snapshot().notice).toBe('Save Plan before you rename or move it.');
    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Plan.md');
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe('# Inbox\n\nSee [[Plan]] and [[Plan#Goals]].\n');
    expect(snapshot().noticeActions?.map((action) => action.label)).toEqual(['Undo']);
  });

  it('Undo is refused when the old name was taken since, and can be tried again', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');
    const taken = await noteFiles.createNote({ location: JOURNAL, parent: JOURNAL, name: 'Draft' });

    await controller.runNoticeAction(undo);
    expect(snapshot().notice).toBe('Another note in this folder already has that name. Choose another name.');
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe('# Inbox\n\nSee [[Plan]] and [[Plan#Goals]].\n');
    await noteFiles.deleteNote({ location: JOURNAL, note: taken.displayPath });
    const again = snapshot().noticeActions?.[0];
    if (!again) throw new Error('no Undo offered again');
    await controller.runNoticeAction(again);

    expect(noteFiles.notePaths()).not.toContain('E:\\Journal\\Plan.md');
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
  });

  it('when the links cannot be restored after the note moved back, Try Again restores only them', async () => {
    const { controller, noteFiles, notesIndex, snapshot } = await startInJournal();
    notesIndex.linkUpdatePlans.set('Draft.md', planRenamingDraftTo(noteFiles, 'Plan'));
    await renameDraftToPlan(controller);
    await controller.execute({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: false });
    const undo = snapshot().noticeActions?.[0];
    if (!undo) throw new Error('no Undo offered');
    noteFiles.failsNextLinkUpdate = true;

    await controller.runNoticeAction(undo);
    expect(snapshot().notice).toBe(
      'Draft has its old name and place again, but its links could not be restored yet.',
    );
    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Draft.md');
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe('# Inbox\n\nSee [[Plan]] and [[Plan#Goals]].\n');
    const tryAgain = snapshot().noticeActions?.[0];
    if (!tryAgain) throw new Error('no Try Again offered');
    expect(tryAgain.label).toBe('Try Again');
    await controller.runNoticeAction(tryAgain);

    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Draft.md');
    expect(noteFiles.textOf('E:\\Journal\\Inbox.md')).toBe(TEXTS['E:\\Journal\\Inbox.md']);
    expect(snapshot().notice).toBe('Draft has its old name and place again, and its links are as they were.');
  });
});
