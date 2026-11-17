import { fileArcEntries } from '@mdx/core';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { FolderTreeState } from '../folder-tree/FolderTreeState';
import { explorerArcRows } from './explorerArcRows';
import { fileArcWordingFor } from './viewerFileArc';

const at = (path: string) => InMemoryDocumentFiles.locationOf(path);
const HANDBOOK = at('C:\\Handbook');

function handbookTree(): FolderTreeState {
  const tree = new FolderTreeState();
  tree.listings.set('C:\\Handbook', {
    folders: [at('C:\\Handbook\\docs'), at('C:\\Handbook\\reference')],
    documents: [at('C:\\Handbook\\README.md'), at('C:\\Handbook\\CHANGELOG.md')],
  });
  tree.listings.set('C:\\Handbook\\docs', {
    folders: [],
    documents: [at('C:\\Handbook\\docs\\install.md'), at('C:\\Handbook\\docs\\themes.md')],
  });
  tree.listings.set('C:\\Handbook\\reference', {
    folders: [],
    documents: [at('C:\\Handbook\\reference\\api.md')],
  });
  tree.expandedFolderPaths.add('C:\\Handbook\\docs');
  return tree;
}

function listedNames(tree: FolderTreeState, isSectionExpanded = true): string[] {
  const roots = explorerArcRows([HANDBOOK], tree, isSectionExpanded);
  return fileArcEntries({ roots, recentFiles: [at('C:\\a.md')], openTabKeys: new Set() }).map(
    (entry) => entry.name,
  );
}

describe('explorerArcRows', () => {
  it('files follow the tree order, folders first as the tree shows them', () => {
    expect(listedNames(handbookTree())).toEqual(['install.md', 'themes.md', 'README.md', 'CHANGELOG.md']);
  });

  it('collapsed folders are left out', () => {
    const tree = handbookTree();

    tree.toggleFolder('C:\\Handbook\\docs');

    expect(listedNames(tree)).toEqual(['README.md', 'CHANGELOG.md']);
  });

  it('a collapsed root or section lists nothing rather than the recent files', () => {
    const tree = handbookTree();
    expect(listedNames(tree, false)).toEqual([]);

    tree.toggleRoot(HANDBOOK.canonicalKey);

    expect(listedNames(tree)).toEqual([]);
  });

  it('reads no folder: a folder the tree has not listed contributes nothing', () => {
    const tree = handbookTree();
    tree.expandedFolderPaths.add('C:\\Handbook\\reference\\deeper');
    tree.listings.delete('C:\\Handbook\\docs');

    expect(listedNames(tree)).toEqual(['README.md', 'CHANGELOG.md']);
  });

  it('names the folder each file is in', () => {
    const roots = explorerArcRows([HANDBOOK], handbookTree(), true);
    const [install] = fileArcEntries({ roots, recentFiles: [], openTabKeys: new Set() });

    expect(install?.folderLabel).toBe('Handbook › docs');
  });
});

describe('fileArcWordingFor', () => {
  it('the Markdown viewer moves between files', () => {
    expect(
      fileArcWordingFor({ activeKindId: 'markdownViewer', isNotesShown: false, isSpecViewerShown: false }),
    ).toBe('files');
  });

  it('the spec viewer has no arc, so Ctrl with the wheel keeps zooming there', () => {
    expect(
      fileArcWordingFor({ activeKindId: 'specViewer', isNotesShown: false, isSpecViewerShown: true }),
    ).toBeUndefined();
  });
});
