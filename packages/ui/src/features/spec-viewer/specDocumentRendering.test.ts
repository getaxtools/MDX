import { createTranslator } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { specStructureFor } from './specDocumentRendering';

function locationOf(displayPath: string) {
  return { canonicalKey: displayPath.toLowerCase(), displayPath, fileName: 'spec.md' };
}

describe('specStructureFor', () => {
  it.each([
    ['C:\\Shop\\openspec\\changes\\add-pins\\specs\\tabs\\spec.md', 'deltaSpec'],
    ['C:\\Shop\\openspec\\changes\\archive\\2026-10-01-add-tabs\\specs\\tabs\\spec.md', 'deltaSpec'],
    ['C:\\Shop\\openspec\\specs\\identity\\user-auth\\spec.md', 'mainSpec'],
    ['C:\\Shop\\api\\openspec\\specs\\tabs\\spec.md', 'mainSpec'],
  ])('marks %s as %s', (path, kind) => {
    expect(specStructureFor(locationOf(path), createTranslator())?.kind).toBe(kind);
  });

  it.each([
    'C:\\Shop\\openspec\\changes\\add-pins\\proposal.md',
    'C:\\Shop\\openspec\\changes\\add-pins\\specs\\tabs\\notes.md',
    'C:\\Shop\\docs\\spec.md',
  ])('leaves %s unmarked', (path) => {
    expect(specStructureFor(locationOf(path), createTranslator())).toBeUndefined();
  });

  it('labels the delta sections in the language of the app', () => {
    const rendering = specStructureFor(
      locationOf('C:\\Shop\\openspec\\changes\\add-pins\\specs\\tabs\\spec.md'),
      createTranslator(),
    );

    expect(rendering?.sectionLabels).toEqual({
      added: 'Added',
      modified: 'Modified',
      removed: 'Removed',
      renamed: 'Renamed',
    });
  });
});
