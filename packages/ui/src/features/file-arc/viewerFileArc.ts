import { DEFAULT_WORKSPACE_KIND_ID } from '@mdx/core';
import type { FolderTreeState } from '../folder-tree/FolderTreeState';
import type { ViewerSnapshot } from '../viewer/ViewerController';
import { explorerArcRows } from './explorerArcRows';
import type { FileArcList } from './FileArcSession';
import type { FileArcWording } from './fileArcText';

/** What the window shows that decides whether it has an arc. */
export interface FileArcKindView {
  readonly activeKindId: string;
  readonly isNotesShown: boolean;
  readonly isSpecViewerShown: boolean;
}

/** The Markdown viewer moves between files; the Spec viewer and other kinds have no arc. */
export function fileArcWordingFor({
  activeKindId,
  isNotesShown,
  isSpecViewerShown,
}: FileArcKindView): FileArcWording | undefined {
  if (isNotesShown || isSpecViewerShown) return undefined;
  return activeKindId === DEFAULT_WORKSPACE_KIND_ID ? 'files' : undefined;
}

export function fileArcWordingOf(snapshot: ViewerSnapshot): FileArcWording | undefined {
  return fileArcWordingFor({
    activeKindId: snapshot.viewer.workspaceKinds.activeKindId(),
    isNotesShown: snapshot.notes !== undefined,
    isSpecViewerShown: snapshot.specProjects !== undefined,
  });
}

/** What the arc lists now: the Folders section as it is expanded, or the recent files without it. */
export function fileArcListOf(snapshot: ViewerSnapshot, explorerTree: FolderTreeState): FileArcList {
  const { viewer } = snapshot;
  const isFoldersSectionExpanded = !viewer.viewSettings.collapsedExplorerSections.includes('folders');
  return {
    source: {
      roots: explorerArcRows(viewer.explorerFolders.folders(), explorerTree, isFoldersSectionExpanded),
      recentFiles: viewer.recentFiles.entries().map((recentFile) => recentFile.location),
      openTabKeys: new Set(viewer.tabStrip.tabs().map((tab) => tab.location.canonicalKey)),
    },
    activeKey: viewer.tabStrip.activeTab()?.location.canonicalKey,
  };
}
