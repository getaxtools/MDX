import { describe, expect, it } from 'vitest';
import { tagTree, type TagNode } from './tagTree';

function shown(nodes: readonly TagNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    `${'  '.repeat(depth)}${node.name} (${String(node.notes)})`,
    ...shown(node.children, depth + 1),
  ]);
}

describe('tag tree', () => {
  it('nested tags with counts', () => {
    const tree = tagTree(
      [
        { tag: 'work', notes: 2 },
        { tag: 'work/finance', notes: 1 },
        { tag: 'home', notes: 3 },
        { tag: 'projects/2026/q3', notes: 1 },
      ],
      'en',
    );

    expect(shown(tree)).toEqual([
      'home (3)',
      'projects (0)',
      '  2026 (0)',
      '    q3 (1)',
      'work (2)',
      '  finance (1)',
    ]);
  });

  it('keeps the whole tag of every level for searching', () => {
    const tree = tagTree([{ tag: 'projects/2026/q3', notes: 1 }], 'en');

    expect(tree[0]?.children[0]?.children[0]?.tag).toBe('projects/2026/q3');
    expect(tree[0]?.children[0]?.tag).toBe('projects/2026');
  });

  it('numbers sort by value and case is ignored', () => {
    const tree = tagTree(
      [
        { tag: 'Sprint 10', notes: 1 },
        { tag: 'sprint 2', notes: 1 },
        { tag: 'alpha', notes: 1 },
      ],
      'en',
    );

    expect(tree.map((node) => node.name)).toEqual(['alpha', 'sprint 2', 'Sprint 10']);
  });
});
