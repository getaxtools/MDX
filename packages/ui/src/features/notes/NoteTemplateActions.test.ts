import { ViewerSession, WorkspaceKindsState, notesSettingsOf, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
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
const THURSDAY = new Date(2026, 10, 12, 9, 5);
const TEMPLATES: Readonly<Record<string, string>> = {
  'E:\\Journal\\Templates\\Day.md': '# {{title}}\n\nWritten on {{date:dddd D MMMM}}.\n',
  'E:\\Journal\\Templates\\Meeting.md': '# {{title}}\n\nAttendees:\n',
};

async function startInJournal() {
  const documentFiles = new InMemoryDocumentFiles();
  const noteFiles = new InMemoryNoteFiles({ folders: ['E:\\Journal\\Templates'], texts: TEMPLATES });
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
    now: () => THURSDAY,
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
  const tabPaths = () =>
    snapshot()
      .viewer.tabStrip.tabs()
      .map((tab) => tab.location.displayPath);
  return { controller, session, noteFiles, documentFiles, snapshot, tabPaths };
}

describe('daily notes and templates', () => {
  it('today’s note is created once in Daily and reopened', async () => {
    const { controller, noteFiles, documentFiles, tabPaths } = await startInJournal();
    documentFiles.write('E:\\Journal\\Daily\\2026-11-12.md', '');

    await controller.execute({ kind: 'openTodaysNote' });
    await controller.execute({ kind: 'closeActiveTab' });
    await controller.execute({ kind: 'openTodaysNote' });

    expect(noteFiles.notePaths().filter((path) => path.includes('\\Daily\\'))).toEqual([
      'E:\\Journal\\Daily\\2026-11-12.md',
    ]);
    expect(tabPaths()).toEqual(['E:\\Journal\\Daily\\2026-11-12.md']);
  });

  it('a daily template fills today’s note', async () => {
    const { controller, session, noteFiles, documentFiles } = await startInJournal();
    const settings = { ...notesSettingsOf(session.shownWorkspace()), dailyTemplate: 'Day' };
    await controller.execute({ kind: 'updateNotesSettings', settings });
    documentFiles.write('E:\\Journal\\Daily\\2026-11-12.md', '');

    await controller.execute({ kind: 'openTodaysNote' });

    expect(noteFiles.textOf('E:\\Journal\\Daily\\2026-11-12.md')).toBe(
      '# 2026-11-12\n\nWritten on Thursday 12 November.\n',
    );
  });

  it('a note from a template has its variables filled', async () => {
    const { controller, noteFiles, documentFiles, snapshot, tabPaths } = await startInJournal();
    documentFiles.write('E:\\Journal\\Standup.md', '');

    await controller.execute({ kind: 'showNewNoteFromTemplate' });
    expect(snapshot().openDialog).toBe('noteFromTemplate');
    expect(snapshot().notes?.templates).toEqual(['Day', 'Meeting']);
    await controller.execute({ kind: 'createNoteFromTemplate', template: 'Meeting', name: 'Standup' });

    expect(noteFiles.textOf('E:\\Journal\\Standup.md')).toBe('# Standup\n\nAttendees:\n');
    expect(tabPaths()).toEqual(['E:\\Journal\\Standup.md']);
  });

  it('settings are kept with the workspace, and daily notes go to the chosen folder and name', async () => {
    const { controller, session, noteFiles, documentFiles } = await startInJournal();
    const settings = {
      dailyFolder: 'Journal/Days',
      dailyNameFormat: 'dddd D MMMM',
      templatesFolder: 'Templates',
      attachmentsFolder: 'Attachments',
      excludedPaths: [],
    };
    documentFiles.write('E:\\Journal\\Journal\\Days\\Thursday 12 November.md', '');

    await controller.execute({ kind: 'updateNotesSettings', settings });
    await controller.execute({ kind: 'openTodaysNote' });

    expect(notesSettingsOf(session.shownWorkspace())).toEqual(settings);
    expect(noteFiles.notePaths()).toContain('E:\\Journal\\Journal\\Days\\Thursday 12 November.md');
  });

  it('a template that cannot be read leaves the new note empty and says so', async () => {
    const { controller, noteFiles, documentFiles, snapshot } = await startInJournal();
    documentFiles.write('E:\\Journal\\Plan.md', '');

    await controller.execute({ kind: 'createNoteFromTemplate', template: 'Missing', name: 'Plan' });

    expect(noteFiles.textOf('E:\\Journal\\Plan.md')).toBe('');
    expect(snapshot().notice).toBe('The template Missing could not be read, so the note starts empty.');
  });
});
