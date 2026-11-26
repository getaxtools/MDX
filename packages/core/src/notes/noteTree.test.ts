import type { DocumentLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { noteNameOf, noteTreeNodes, type NoteTreeNode } from './noteTree';

const LOCATION = 'C:\\Notes';

function entry(fileName: string): DocumentLocation {
  const displayPath = `${LOCATION}\\${fileName}`;
  return { canonicalKey: displayPath.toLowerCase(), displayPath, fileName };
}

function rows(nodes: readonly NoteTreeNode[]): string[] {
  return nodes.map((node) => {
    if (node.note && node.folder) return `${node.name} (note with children)`;
    return node.folder ? `${node.name} (folder)` : node.name;
  });
}

describe('note tree', () => {
  it('a note and its same-named folder are one node', () => {
    const nodes = noteTreeNodes(
      { folders: [entry('Projects')], documents: [entry('Projects.md'), entry('Inbox.md')] },
      'en',
    );

    expect(rows(nodes)).toEqual(['Projects (note with children)', 'Inbox']);
    expect(nodes[0]?.note?.fileName).toBe('Projects.md');
    expect(nodes[0]?.folder?.fileName).toBe('Projects');
  });

  it('pairs a note and its folder whatever their case', () => {
    const nodes = noteTreeNodes({ folders: [entry('projects')], documents: [entry('Projects.md')] }, 'en');

    expect(rows(nodes)).toEqual(['Projects (note with children)']);
  });

  it('dot folders and the app folder are hidden', () => {
    const nodes = noteTreeNodes(
      {
        folders: [entry('.mdx-notes'), entry('.git'), entry('Daily')],
        documents: [entry('.draft.md'), entry('Inbox.md')],
      },
      'en',
    );

    expect(rows(nodes)).toEqual(['Daily (folder)', 'Inbox']);
  });

  it('names sort like the Explorer', () => {
    const nodes = noteTreeNodes(
      {
        folders: [entry('b folder'), entry('A folder')],
        documents: [entry('Note 10.md'), entry('note 2.md'), entry('Note 1.md'), entry('apple.md')],
      },
      'en',
    );

    expect(rows(nodes)).toEqual([
      'A folder (folder)',
      'b folder (folder)',
      'apple',
      'Note 1',
      'note 2',
      'Note 10',
    ]);
  });

  it('a second note of the same name stays its own node', () => {
    const nodes = noteTreeNodes(
      { folders: [entry('Plan')], documents: [entry('Plan.md'), entry('Plan.markdown')] },
      'en',
    );

    expect(rows(nodes)).toEqual(['Plan (note with children)', 'Plan']);
    expect(nodes[1]?.note?.fileName).toBe('Plan.markdown');
  });

  it('a note name drops any Markdown extension', () => {
    expect(['a.md', 'b.MARKDOWN', 'c.mdown', 'd.mkd', 'e.mdx', 'f.txt'].map(noteNameOf)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f.txt',
    ]);
  });
});
