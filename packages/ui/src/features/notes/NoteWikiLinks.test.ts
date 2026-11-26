import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
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
const NOTES: Readonly<Record<string, string>> = {
  'E:\\Journal\\Inbox.md': 'See [[Plan#Next Steps]] and [[Budget]].',
  'E:\\Journal\\Projects\\Plan.md': '# Plan\n\n## Next Steps\n\nText.',
};

async function startInJournal() {
  const documentFiles = new InMemoryDocumentFiles(NOTES);
  const noteFiles = new InMemoryNoteFiles({ folders: ['E:\\Journal\\Projects'], notes: Object.keys(NOTES) });
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
  await controller.openDocuments(['E:\\Journal\\Inbox.md']);
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  const shownPage = () => new DOMParser().parseFromString(snapshot().activeDocument?.html ?? '', 'text/html');
  return { controller, noteFiles, snapshot, shownPage };
}

describe('wiki-links in a Notes workspace', () => {
  it('a wiki-link to a note in another folder links to it at its heading', async () => {
    const { shownPage } = await startInJournal();

    const link = shownPage().querySelector('a.wiki-link');

    expect(link?.getAttribute('href')).toBe('Projects/Plan.md#mdx-next-steps');
    expect(link?.getAttribute('data-mdx-link')).toBe('document');
  });

  it('activating a wiki-link opens the note and asks for its heading', async () => {
    const { controller, snapshot } = await startInJournal();

    await controller.openLink({ kind: 'document', href: 'Projects/Plan.md#mdx-next-steps' });

    expect(snapshot().viewer.tabStrip.activeTab()?.location.displayPath).toBe(
      'E:\\Journal\\Projects\\Plan.md',
    );
    expect(snapshot().linkedHeadingRequest).toMatchObject({
      canonicalKey: 'e:\\journal\\projects\\plan.md',
      fragment: 'mdx-next-steps',
    });
  });

  it('a link to a note that does not exist yet is marked and offers to create it next to the linking note', async () => {
    const { controller, shownPage, snapshot } = await startInJournal();
    expect(shownPage().querySelector('.wiki-link-unresolved')?.textContent).toBe('Budget (no note yet)');

    await controller.openLink({ kind: 'unresolvedNote', href: 'Budget' });

    expect(snapshot().notice).toBe('There is no note named Budget yet.');
    expect(snapshot().noticeActions).toEqual([
      { label: 'Create Note', command: { kind: 'createNote', parent: JOURNAL, name: 'Budget' } },
    ]);
  });

  it('a note created for a link makes the link resolve', async () => {
    const { controller, shownPage } = await startInJournal();

    await controller.execute({ kind: 'createNote', parent: JOURNAL, name: 'Budget' });
    await controller.openDocuments(['E:\\Journal\\Inbox.md']);

    expect([...shownPage().querySelectorAll('a.wiki-link')].map((link) => link.getAttribute('href'))).toEqual(
      ['Projects/Plan.md#mdx-next-steps', 'Budget.md'],
    );
  });

  it('documents outside Notes workspaces keep wiki-link text as typed', async () => {
    const { controller, snapshot, shownPage } = await startInJournal();
    const defaultWorkspace = snapshot()
      .workspaces?.registry.workspaces()
      .find((workspace) => workspace.kindId === 'markdownViewer');
    await controller.execute({ kind: 'switchWorkspace', workspaceId: defaultWorkspace?.id ?? '' });

    await controller.openDocuments(['E:\\Journal\\Inbox.md']);

    expect(shownPage().querySelector('a.wiki-link')).toBeNull();
    expect(shownPage().body.textContent).toContain('[[Plan#Next Steps]]');
  });
});
