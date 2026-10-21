import { describe, expect, it } from 'vitest';
import { breadcrumbFolders } from './breadcrumbFolders';

describe('breadcrumbFolders', () => {
  it('lists the folders above a document without the drive', () => {
    expect(breadcrumbFolders('C:\\Docs\\guides\\setup.md')).toEqual({
      names: ['Docs', 'guides'],
      isShortened: false,
    });
  });

  it('keeps only the nearest folders of a deep path', () => {
    expect(breadcrumbFolders('C:\\a\\b\\c\\d\\e.md')).toEqual({ names: ['b', 'c', 'd'], isShortened: true });
  });

  it('handles network shares, long-path prefixes and forward slashes', () => {
    expect(breadcrumbFolders('\\\\server\\share\\Notes.md').names).toEqual(['server', 'share']);
    expect(breadcrumbFolders('\\\\?\\C:\\Docs\\a.md').names).toEqual(['Docs']);
    expect(breadcrumbFolders('/home/ada/notes/todo.md').names).toEqual(['home', 'ada', 'notes']);
  });

  it('has no folders for a document that is not saved yet', () => {
    expect(breadcrumbFolders('Untitled-1.md')).toEqual({ names: [], isShortened: false });
  });
});
