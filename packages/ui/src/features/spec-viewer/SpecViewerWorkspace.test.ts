import { ViewerSession, WorkspaceKindsState, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryFolders,
  InMemorySpecProjects,
  InMemoryWorkspaceStore,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from '../viewer/ViewerController';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });
const PROJECT = 'C:\\Projects\\shop';
const SPEC_PATH = 'C:\\Projects\\shop\\openspec\\specs\\tabs\\spec.md';

async function startWithSpecProjects(documents: Readonly<Record<string, string>> = {}) {
  const specProjects = new InMemorySpecProjects({
    [PROJECT]: {
      files: { 'openspec/specs/tabs/spec.md': '# tabs', 'openspec/changes/add-pins/tasks.md': '- [x] 1.1' },
    },
  });
  const folders = new InMemoryFolders();
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
    folders,
    specProjects,
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
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, folders, specProjects, snapshot };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a Spec viewer workspace', () => {
  it('shows the spec projects of its folders in place of Folders', async () => {
    const { controller, folders, snapshot } = await startWithSpecProjects();
    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'specViewer' });
    folders.pickedFolder = PROJECT;

    await controller.execute({ kind: 'openFolder' });
    await settled();

    const project = snapshot().specProjects?.roots?.[0]?.projects[0];
    expect(project?.capabilities.map((capability) => capability.name)).toEqual(['tabs']);
    expect(project?.activeChanges[0]?.progress).toEqual({ done: 1, total: 1 });
  });

  it('opens a project dashboard in a tab that stays out of recent files', async () => {
    const { controller, folders, snapshot } = await startWithSpecProjects();
    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'specViewer' });
    folders.pickedFolder = PROJECT;
    await controller.execute({ kind: 'openFolder' });
    await settled();
    const rootKey = snapshot().specProjects?.roots?.[0]?.root.canonicalKey ?? '';

    await controller.execute({ kind: 'openSpecDashboard', rootKey, folder: '' });

    const activeTab = snapshot().viewer.tabStrip.activeTab();
    expect(activeTab?.location.fileName).toBe('Dashboard - shop');
    expect(activeTab?.location.canonicalKey.startsWith('view:')).toBe(true);
    expect(snapshot().viewer.recentFiles.entries()).toEqual([]);
  });

  it('opens the page of an active change in a tab', async () => {
    const { controller, folders, snapshot } = await startWithSpecProjects();
    await controller.execute({ kind: 'createWorkspace', name: 'Plans', kindId: 'specViewer' });
    folders.pickedFolder = PROJECT;
    await controller.execute({ kind: 'openFolder' });
    await settled();
    const rootKey = snapshot().specProjects?.roots?.[0]?.root.canonicalKey ?? '';

    await controller.execute({ kind: 'openSpecChange', rootKey, changeFolder: 'openspec/changes/add-pins' });

    expect(snapshot().viewer.tabStrip.activeTab()?.location.fileName).toBe('Change: add-pins');
  });

  it('opens the document of a finding at the heading that holds its line', async () => {
    const { controller, snapshot } = await startWithSpecProjects({
      [SPEC_PATH]: '# tabs\n\n## Requirements\n\n### Requirement: Pin tabs\nText.\n',
    });

    await controller.execute({ kind: 'openSpecFinding', documentPath: SPEC_PATH, line: 6 });

    expect(snapshot().viewer.tabStrip.activeTab()?.location.displayPath).toBe(SPEC_PATH);
    expect(snapshot().linkedHeadingRequest?.fragment).toBe(
      snapshot().activeDocument?.outline.find((entry) => entry.text === 'Requirement: Pin tabs')?.id,
    );
  });

  it('does not scan the folders of a Markdown viewer workspace', async () => {
    const { controller, folders, specProjects, snapshot } = await startWithSpecProjects();
    folders.pickedFolder = PROJECT;

    await controller.execute({ kind: 'openFolder' });
    await settled();

    expect(snapshot().specProjects).toBeUndefined();
    expect(specProjects.readFiles).toEqual([]);
  });
});
