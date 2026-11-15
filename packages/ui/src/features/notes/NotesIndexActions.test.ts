import {
  DEFAULT_NOTES_SETTINGS,
  ViewerSession,
  WorkspaceKindsState,
  notesLocationOf,
  workspaceKindsFor,
} from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryNoteFiles,
  InMemoryNotesIndex,
  InMemoryNotesLocations,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it, vi } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const JOURNAL = 'E:\\Journal';
const OPTIONS = { isCaseSensitive: false, isWholeWord: false };

async function startInJournal(documents: Readonly<Record<string, string>> = {}) {
  const notesIndex = new InMemoryNotesIndex();
  const noteFiles = new InMemoryNoteFiles({ notes: Object.keys(documents) });
  let nextId = 0;
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles(documents),
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
  const defaultWorkspaceId = session.shownWorkspace()?.id ?? '';
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
  const locationId = (shown && notesLocationOf(shown)?.locationId) ?? '';
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, notesIndex, noteFiles, snapshot, locationId, defaultWorkspaceId };
}

describe('the notes index', () => {
  it('is shown with a Notes workspace and hidden when another workspace is shown', async () => {
    const { controller, notesIndex, locationId, defaultWorkspaceId } = await startInJournal();
    expect(notesIndex.shownLocationId).toBe(locationId);

    await controller.execute({ kind: 'switchWorkspace', workspaceId: defaultWorkspaceId });

    expect(notesIndex.shownLocationId).toBeUndefined();
  });

  it('is shown again without the paths the settings leave out', async () => {
    const { controller, notesIndex } = await startInJournal();
    expect(notesIndex.shownExcludedPaths).toEqual([]);

    await controller.execute({
      kind: 'updateNotesSettings',
      settings: { ...DEFAULT_NOTES_SETTINGS, excludedPaths: ['Private'] },
    });

    expect(notesIndex.shownExcludedPaths).toEqual(['Private']);
  });

  it('a search in a Notes workspace goes to the index and lists the hits by note', async () => {
    const { controller, notesIndex, locationId } = await startInJournal();
    const match = { lineNumber: 3, preview: 'Coffee at the Café', ranges: [[14, 18] as const] };
    notesIndex.results = {
      hits: [
        { path: 'Trips/Paris.md', headingPosition: 0, heading: 'Paris', matches: [match] },
        {
          path: 'Trips/Paris.md',
          headingPosition: 1,
          heading: 'Food',
          matches: [{ ...match, lineNumber: 9 }],
        },
      ],
      isIncomplete: false,
      notSearchedOnlineOnly: 2,
    };

    const results = await controller.searchFolders('cafe tag:travel', OPTIONS);

    expect(notesIndex.searches).toEqual([{ locationId, query: 'cafe tag:travel' }]);
    expect(controller.hasSearchableFolders()).toBe(true);
    expect(results.notSearchedOnlineOnly).toBe(2);
    expect(results.documents).toHaveLength(1);
    expect(results.documents[0]?.location.displayPath).toBe('E:\\Journal\\Trips\\Paris.md');
    expect(results.documents[0]?.matches.map((line) => line.lineNumber)).toEqual([3, 9]);
  });

  it('shows how far the index of the shown workspace is', async () => {
    const { notesIndex, snapshot, locationId } = await startInJournal();
    const building = {
      locationId,
      indexed: 500,
      toIndex: 1200,
      isBuilding: true,
      wasRebuilt: false,
      isWatched: true,
    };

    notesIndex.sendStatus({ ...building, locationId: 'another-location' });
    expect(snapshot().notes?.indexStatus).toBeUndefined();
    notesIndex.sendStatus(building);

    expect(snapshot().notes?.indexStatus).toEqual(building);
  });

  it('a note written by another program makes a link to it resolve in the shown note', async () => {
    const { controller, notesIndex, noteFiles, snapshot, locationId } = await startInJournal({
      'E:\\Journal\\Inbox.md': 'See [[Budget]].',
    });
    await controller.openDocuments(['E:\\Journal\\Inbox.md']);
    const linksIn = () =>
      new DOMParser()
        .parseFromString(snapshot().activeDocument?.html ?? '', 'text/html')
        .querySelectorAll('a.wiki-link').length;
    expect(linksIn()).toBe(0);

    await noteFiles.createNote({ location: JOURNAL, parent: JOURNAL, name: 'Budget' });
    notesIndex.sendChanges({
      locationId,
      changes: [{ path: 'Budget.md', kind: 'added', sectionHashes: [] }],
    });

    await vi.waitFor(() => expect(linksIn()).toBe(1));
  });
  it('a folder that reports no changes is checked again when the window gets the focus', async () => {
    const { controller, notesIndex, locationId } = await startInJournal();
    await controller.windowFocused();
    expect(notesIndex.refreshedLocationIds).toEqual([]);
    notesIndex.sendStatus({
      locationId,
      indexed: 3,
      toIndex: 3,
      isBuilding: false,
      wasRebuilt: false,
      isWatched: false,
    });

    await controller.windowFocused();

    expect(notesIndex.refreshedLocationIds).toEqual([locationId]);
  });

  it('the shown note lists the notes linking to it, and a chosen one opens with the link found', async () => {
    const { controller, notesIndex, snapshot } = await startInJournal({
      'E:\\Journal\\Plan.md': '# Plan',
      'E:\\Journal\\Inbox.md': 'Read the [[plan]].',
    });
    notesIndex.backlinksByNote.set('Plan.md', [
      { path: 'Inbox.md', lineNumber: 1, line: 'Read the [[plan]].' },
    ]);

    await controller.openDocuments(['E:\\Journal\\Plan.md']);
    await vi.waitFor(() => expect(snapshot().noteBacklinks?.backlinks).toHaveLength(1));
    await controller.execute({ kind: 'openBacklink', path: 'Inbox.md', noteName: 'Plan' });

    expect(snapshot().viewer.tabStrip.activeTab()?.location.displayPath).toBe('E:\\Journal\\Inbox.md');
    expect(snapshot().findQuery?.text).toBe('Plan');
  });

  it('a note being edited is offered wiki-links that mean the suggested notes from it', async () => {
    const { controller, notesIndex, snapshot } = await startInJournal({
      'E:\\Journal\\Plan.md': '# Plan',
      'E:\\Journal\\Projects\\Plan.md': '# Projects plan',
      'E:\\Journal\\Projects\\Inbox.md': 'Read the ',
      'E:\\Journal\\Roadmap.md': '# Roadmap',
    });
    notesIndex.noteSuggestions = [
      { path: 'Projects/Plan.md', name: 'Plan', alias: null },
      { path: 'Plan.md', name: 'Plan', alias: null },
      { path: 'Roadmap.md', name: 'Roadmap', alias: 'Plan for Q3' },
    ];
    notesIndex.headingsByTarget.set('plan', [{ level: 2, text: 'Goals' }]);
    await controller.openDocuments(['E:\\Journal\\Projects\\Inbox.md']);
    const inbox = snapshot().viewer.tabStrip.activeTab()?.location;
    if (!inbox) throw new Error('the note did not open');

    const suggester = controller.wikiLinkSuggesterFor(inbox);
    const notes = await suggester?.notes('pl');

    expect(notes).toEqual([
      { name: 'Plan', target: 'Plan', folder: 'Projects', alias: null },
      { name: 'Roadmap', target: 'Roadmap', folder: '', alias: 'Plan for Q3' },
    ]);
    expect(notesIndex.suggestionRequests).toEqual([{ typed: 'pl', fromNote: 'Projects/Inbox.md' }]);
    expect(await suggester?.headings('Plan')).toEqual([{ level: 2, text: 'Goals' }]);
  });

  it('a document outside the notes folder is offered no wiki-links', async () => {
    const { controller } = await startInJournal();

    expect(
      controller.wikiLinkSuggesterFor(InMemoryDocumentFiles.locationOf('C:\\Docs\\Guide.md')),
    ).toBeUndefined();
  });

  it('tags are listed once the index is built, and a chosen tag searches its notes', async () => {
    const { controller, notesIndex, snapshot, locationId } = await startInJournal();
    notesIndex.tagCounts = [{ tag: 'work', notes: 2 }];

    notesIndex.sendStatus({
      locationId,
      indexed: 2,
      toIndex: 2,
      isBuilding: false,
      wasRebuilt: false,
      isWatched: true,
    });
    await vi.waitFor(() => expect(snapshot().notes?.tags).toEqual([{ tag: 'work', notes: 2 }]));
    await controller.execute({ kind: 'showNotesWithTag', tag: 'work' });

    expect(snapshot().folderSearchQuery).toBe('tag:work');
    expect(snapshot().viewer.viewSettings.sidebarView).toBe('search');
  });

  it('Clear All Data removes the notes index and never a note', async () => {
    const { controller, notesIndex, noteFiles } = await startInJournal({ 'E:\\Journal\\Plan.md': '# Plan' });

    await controller.execute({ kind: 'clearAllData' });

    expect(notesIndex.wasCleared).toBe(true);
    expect(noteFiles.notePaths()).toEqual(['E:\\Journal\\Plan.md']);
  });
});
