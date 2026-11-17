import { fileArcEntries, type NoteTreeNode } from '@mdx/core';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { NoteTreeMemory } from '../notes/NoteTreeMemory';
import { keyOfNode } from '../notes/noteTreeState';
import { noteArcRows } from './noteArcRows';

const NOTES = 'C:\\Notes';
const at = (path: string) => InMemoryDocumentFiles.locationOf(path);
const PROJECTS: NoteTreeNode = { name: 'Projects', folder: at('C:\\Notes\\Projects') };
const ROADMAP: NoteTreeNode = { name: 'MDX roadmap', note: at('C:\\Notes\\Projects\\MDX roadmap.md') };
const INBOX: NoteTreeNode = { name: 'Inbox', note: at('C:\\Notes\\Inbox.md') };
const RECIPES: NoteTreeNode = {
  name: 'Recipes',
  note: at('C:\\Notes\\Recipes.md'),
  folder: at('C:\\Notes\\Recipes'),
};
const SOUP: NoteTreeNode = { name: 'Soup', note: at('C:\\Notes\\Recipes\\Soup.md') };

function notesTree(): NoteTreeMemory {
  const tree = new NoteTreeMemory();
  tree.nodesByFolder.set(NOTES, [PROJECTS, RECIPES, INBOX]);
  tree.nodesByFolder.set('C:\\Notes\\Projects', [ROADMAP]);
  tree.nodesByFolder.set('C:\\Notes\\Recipes', [SOUP]);
  tree.expandedKeys.add(keyOfNode(PROJECTS));
  return tree;
}

function listedNames(tree: NoteTreeMemory, isSectionExpanded = true): string[] {
  const roots = noteArcRows(NOTES, tree, isSectionExpanded);
  return fileArcEntries({ roots, recentFiles: [], openTabKeys: new Set() }).map((entry) => entry.name);
}

describe('noteArcRows', () => {
  it('notes follow the note tree', () => {
    expect(listedNames(notesTree())).toEqual(['MDX roadmap', 'Recipes', 'Inbox']);
  });

  it('a note with child notes is listed before its expanded children', () => {
    const tree = notesTree();

    tree.toggle(keyOfNode(RECIPES));

    expect(listedNames(tree)).toEqual(['MDX roadmap', 'Recipes', 'Soup', 'Inbox']);
  });

  it('collapsed folders and a collapsed section are left out', () => {
    const tree = notesTree();
    expect(listedNames(tree, false)).toEqual([]);

    tree.toggle(keyOfNode(PROJECTS));

    expect(listedNames(tree)).toEqual(['Recipes', 'Inbox']);
  });

  it('names the folder each note is in', () => {
    const [roadmap] = fileArcEntries({
      roots: noteArcRows(NOTES, notesTree(), true),
      recentFiles: [],
      openTabKeys: new Set(),
    });

    expect(roadmap?.folderLabel).toBe('Projects');
  });
});
