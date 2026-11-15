import { describe, expect, it } from 'vitest';
import { noteAddress, parseWikiLink, resolveWikiLink, wikiLinkTargetFor, type NoteEntry } from './wikiLinks';

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

  describe('noteAddress', () => {
    it('links to a note in the same folder by its encoded name', () => {
      expect(noteAddress('Projects/Plan.md', 'Projects/Next Steps.md')).toBe('Next%20Steps.md');
    });

    it('goes up and down through the folders between two notes', () => {
      expect(noteAddress('Daily/2026/Today.md', 'Projects/Plan.md')).toBe('../../Projects/Plan.md');
      expect(noteAddress('Inbox.md', 'Projects/Work/Plan.md')).toBe('Projects/Work/Plan.md');
    });

    it('encodes characters a link would otherwise read as its end or its heading', () => {
      expect(noteAddress('Inbox.md', 'Q&A #1 (draft).md')).toBe('Q%26A%20%231%20(draft).md');
    });
  });
});

describe('wikiLinkTargetFor', () => {
  const notes: NoteEntry[] = [{ path: 'Plan.md' }, { path: 'Projects/Plan.md' }, { path: 'Budget.md' }];

  it('a unique note is named by its name', () => {
    expect(wikiLinkTargetFor('Budget.md', 'Projects/Inbox.md', notes)).toBe('Budget');
  });

  it('the nearest of two notes with one name is named by its name, the other by its path', () => {
    expect(wikiLinkTargetFor('Projects/Plan.md', 'Projects/Inbox.md', notes)).toBe('Plan');
    expect(wikiLinkTargetFor('Projects/Plan.md', 'Inbox.md', notes)).toBe('Projects/Plan');
  });

  it('a note hidden by a nearer note of the same name has no wiki-link', () => {
    expect(wikiLinkTargetFor('Plan.md', 'Projects/Work/Inbox.md', notes)).toBeUndefined();
  });
});
