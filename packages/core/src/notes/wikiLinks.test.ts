import { describe, expect, it } from 'vitest';
import { parseWikiLink, resolveWikiLink, type NoteEntry } from './wikiLinks';

const NOTES: readonly NoteEntry[] = [
  { path: 'Plan.md' },
  { path: 'Projects/Plan.md' },
  { path: 'Projects/Alpha/Notes.md', aliases: ['Alpha notes'] },
  { path: 'Archive/2025/Plan.md' },
];

describe('parseWikiLink', () => {
  it('reads the target, heading and shown text', () => {
    expect(parseWikiLink('Plan#Goals|our goals')).toEqual({
      target: 'Plan',
      heading: 'Goals',
      text: 'our goals',
    });
  });

  it('shows the target and heading when there is no text', () => {
    expect(parseWikiLink('Plan.md#Goals')).toEqual({
      target: 'Plan',
      heading: 'Goals',
      text: 'Plan > Goals',
    });
  });

  it('an empty link is not a link', () => {
    expect(parseWikiLink('  ')).toBeUndefined();
  });
});

describe('resolveWikiLink', () => {
  it('resolves by name ignoring case', () => {
    expect(resolveWikiLink('notes', 'Plan.md', NOTES)?.path).toBe('Projects/Alpha/Notes.md');
  });

  it('resolves by alias', () => {
    expect(resolveWikiLink('alpha NOTES', 'Plan.md', NOTES)?.path).toBe('Projects/Alpha/Notes.md');
  });

  it('two notes of one name pick the nearest', () => {
    expect(resolveWikiLink('Plan', 'Projects/Alpha/Notes.md', NOTES)?.path).toBe('Projects/Plan.md');
    expect(resolveWikiLink('Plan', 'Archive/2025/Old.md', NOTES)?.path).toBe('Archive/2025/Plan.md');
  });

  it('then the shortest path', () => {
    expect(resolveWikiLink('Plan', 'Inbox/Idea.md', NOTES)?.path).toBe('Plan.md');
  });

  it('a path picks that note', () => {
    expect(resolveWikiLink('2025/Plan', 'Plan.md', NOTES)?.path).toBe('Archive/2025/Plan.md');
  });

  it('an unknown name resolves to nothing', () => {
    expect(resolveWikiLink('Missing', 'Plan.md', NOTES)).toBeUndefined();
  });
});
