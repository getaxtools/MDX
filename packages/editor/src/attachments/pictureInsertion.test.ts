import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { nearestLineStart, pictureLinksAt, remotePictureMarkdown } from './pictureInsertion';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('picture insertion', () => {
  it('drop position maps to the nearest line start', () => {
    const state = EditorState.create({ doc: 'First paragraph\nSecond' });

    expect(nearestLineStart(state, 2)).toBe(0);
    expect(nearestLineStart(state, 13)).toBe(16);
  });

  it('a drop on the last line stays at its start', () => {
    const state = EditorState.create({ doc: 'Only line' });

    expect(nearestLineStart(state, 8)).toBe(0);
  });

  it('puts each link on its own line', () => {
    const state = EditorState.create({ doc: 'A\n\nB' });

    const after = state.update(
      pictureLinksAt(state, 3, ['![one](assets/one.png)', '![two](assets/two.png)']),
    ).state;

    expect(after.doc.toString()).toBe('A\n\n![one](assets/one.png)\n![two](assets/two.png)\nB');
  });

  it('starts a new line after a document without a final line break', () => {
    const state = EditorState.create({ doc: 'A' });

    expect(state.update(pictureLinksAt(state, 1, ['![x](x.png)'])).state.doc.toString()).toBe(
      'A\n![x](x.png)\n',
    );
  });

  it('HTML with a remote image inserts a link', () => {
    expect(remotePictureMarkdown('<img src="https://example.com/a.png" alt="Logo">', parse)).toBe(
      '![Logo](https://example.com/a.png)',
    );
  });

  it('HTML with text is left to the normal paste', () => {
    expect(
      remotePictureMarkdown('<p>Hello <img src="https://example.com/a.png"></p>', parse),
    ).toBeUndefined();
    expect(remotePictureMarkdown('<p>Just text</p>', parse)).toBeUndefined();
  });
});
