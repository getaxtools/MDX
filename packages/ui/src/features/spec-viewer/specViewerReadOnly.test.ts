import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemorySpecProjects,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const SPEC_PATH = 'C:\\Projects\\shop\\openspec\\specs\\tabs\\spec.md';
const READ_ONLY_NOTICE =
  'Documents cannot be edited in a Spec viewer workspace. Open the document in a Markdown viewer workspace to edit it.';

async function startIn(kindId: 'specViewer' | 'markdownViewer') {
  let nextId = 0;
  const documentFiles = new InMemoryDocumentFiles({ [SPEC_PATH]: '# tabs' });
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
    specProjects: new InMemorySpecProjects(),
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  session.updateWorkspaceKinds(() =>
    WorkspaceKindsState.fromSaved(
      { enabledKindIds: ['markdownViewer', 'specViewer'], activeKindId: 'markdownViewer' },
      ALL_KINDS_BUILT,
    ),
  );
  if (kindId === 'specViewer') await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId });
  await controller.openDocuments([SPEC_PATH]);
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, documentFiles, snapshot };
}

describe('a Spec viewer workspace is read-only', () => {
  it('says so when the editor is asked for, and keeps the document unchanged', async () => {
    const { controller, documentFiles, snapshot } = await startIn('specViewer');

    await controller.execute({ kind: 'toggleEditing' });

    expect(snapshot().notice).toBe(READ_ONLY_NOTICE);
    expect(snapshot().isActiveDocumentEditing).toBeUndefined();
    expect(documentFiles.savedDocuments).toEqual([]);
  });

  it.each([{ kind: 'newDocument' as const }, { kind: 'togglePreviewBesideEditor' as const }])(
    'refuses $kind',
    async (command) => {
      const { controller, snapshot } = await startIn('specViewer');

      await controller.execute(command);

      expect(snapshot().notice).toBe(READ_ONLY_NOTICE);
      expect(snapshot().viewer.tabStrip.tabs()).toHaveLength(1);
    },
  );

  it('still lets a Markdown viewer workspace edit', async () => {
    const { controller, snapshot } = await startIn('markdownViewer');

    await controller.execute({ kind: 'toggleEditing' });

    expect(snapshot().isActiveDocumentEditing).toBe(true);
  });
});
