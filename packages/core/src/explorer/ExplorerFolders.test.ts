import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { ExplorerFolders, MAX_EXPLORER_FOLDERS } from './ExplorerFolders';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const namesOf = (folders: ExplorerFolders) => folders.folders().map((folder) => folder.fileName);

describe('ExplorerFolders', () => {
  it('keeps folders in the order they were opened', () => {
    const folders = ExplorerFolders.empty().add(location('C:\\Specs')).add(location('D:\\Notes'));

    expect(namesOf(folders)).toEqual(['Specs', 'Notes']);
  });

  it('opens the same folder only once, whatever the spelling', () => {
    const folders = ExplorerFolders.empty().add(location('C:\\Specs')).add(location('c:\\specs'));

    expect(namesOf(folders)).toEqual(['Specs']);
  });

  it('removes a folder', () => {
    const folders = ExplorerFolders.empty().add(location('C:\\Specs')).add(location('D:\\Notes'));

    expect(namesOf(folders.remove(location('C:\\Specs').canonicalKey))).toEqual(['Notes']);
  });

  it(`stops at ${String(MAX_EXPLORER_FOLDERS)} folders`, () => {
    const paths = Array.from(
      { length: MAX_EXPLORER_FOLDERS + 1 },
      (_, index) => `C:\\Folder${String(index)}`,
    );

    const folders = ExplorerFolders.fromFolders(paths.map(location));

    expect(folders.folders()).toHaveLength(MAX_EXPLORER_FOLDERS);
    expect(folders.has(location(paths.at(-1) ?? '').canonicalKey)).toBe(false);
  });
});
