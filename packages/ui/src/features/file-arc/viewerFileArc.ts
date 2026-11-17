import { DEFAULT_WORKSPACE_KIND_ID } from '@mdx/core';
import type { FolderTreeState } from '../folder-tree/FolderTreeState';
import type { NoteTreeMemory } from '../notes/NoteTreeMemory';
import type { ViewerSnapshot } from '../viewer/ViewerController';
import { explorerArcRows } from './explorerArcRows';
import type { FileArcList } from './FileArcSession';
import type { FileArcWording } from './fileArcText';
import { noteArcRows } from './noteArcRows';

/** What the window shows that decides whether it has an arc. */
export interface FileArcKindView {
  readonly activeKindId: string;
  readonly isNotesShown: boolean;
  readonly isSpecViewerShown: boolean;
}

/** The Markdown viewer moves between files and Notes between notes; other kinds have no arc. */
export function fileArcWordingFor({
  activeKindId,
  isNotesShown,
  isSpecViewerShown,
}: FileArcKindView): FileArcWording | undefined {
  if (isNotesShown) return 'notes';
  if (isSpecViewerShown) return undefined;
  return activeKindId === DEFAULT_WORKSPACE_KIND_ID ? 'files' : undefined;
}

export function fileArcWordingOf(snapshot: ViewerSnapshot): FileArcWording | undefined {
  return fileArcWordingFor({
    activeKindId: snapshot.viewer.workspaceKinds.activeKindId(),
    isNotesShown: snapshot.notes !== undefined,
    isSpecViewerShown: snapshot.specProjects !== undefined,
  });
}

/** The trees the side bar keeps while it is hidden. */
export interface SideBarTrees {
  readonly folders: FolderTreeState;
  readonly notes: NoteTreeMemory;
}

/**
 * What the arc lists now: the note tree in Notes, otherwise the Folders section as it is expanded,
 * or the recent files when it has no folder.
 */
export function fileArcListOf(snapshot: ViewerSnapshot, trees: SideBarTrees): FileArcList {
  const { viewer, notes } = snapshot;
  const isTreeSectionExpanded = !viewer.viewSettings.collapsedExplorerSections.includes('folders');
  return {
    source: {
      roots: notes
        ? noteArcRows(notes.locationPath, trees.notes, isTreeSectionExpanded)
        : explorerArcRows(viewer.explorerFolders.folders(), trees.folders, isTreeSectionExpanded),
      recentFiles: notes ? [] : viewer.recentFiles.entries().map((recentFile) => recentFile.location),
      openTabKeys: new Set(viewer.tabStrip.tabs().map((tab) => tab.location.canonicalKey)),
    },
    activeKey: viewer.tabStrip.activeTab()?.location.canonicalKey,
  };
}
