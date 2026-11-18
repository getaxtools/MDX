import { InMemoryDocumentFiles, hasFile, protectedNoteLocation } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import {
  isInsideProtectedSection,
  isProtectedLocation,
  withoutProtectedLocations,
} from './protectedLocations';

const SECTION_FILE = String.raw`E:\Notes\.mdx-notes\protected\notes\4f1c0a2e9b7d4c3a8e6f5d4c3b2a1f0e.mdxp`;

describe('protected locations', () => {
  it('a protected note is protected, by its key and never by its title', () => {
    const note = protectedNoteLocation(
      String.raw`e:\notes`,
      '4f1c0a2e9b7d4c3a8e6f5d4c3b2a1f0e',
      'Bank details',
    );

    expect(isProtectedLocation(note)).toBe(true);
    expect(note.canonicalKey).not.toContain('Bank details');
    expect(hasFile(note)).toBe(false);
  });

  it('every file of a protected section is protected, in any case and with either slash', () => {
    expect(isProtectedLocation(InMemoryDocumentFiles.locationOf(SECTION_FILE))).toBe(true);
    expect(isInsideProtectedSection('E:/Notes/.MDX-NOTES/Protected')).toBe(true);
    expect(isInsideProtectedSection(String.raw`E:\Notes\.mdx-notes\protected`)).toBe(true);
  });

  it('a section folder set aside or being restored is protected too', () => {
    expect(isInsideProtectedSection(String.raw`E:\Notes\.mdx-notes\protected.replaced-1\notes\a.mdxp`)).toBe(
      true,
    );
    expect(isInsideProtectedSection('E:/Notes/.mdx-notes/Protected.Restoring-2/vault.json')).toBe(true);
    expect(isInsideProtectedSection(String.raw`E:\Notes\.mdx-notes\protectedness\Plan.md`)).toBe(false);
  });

  it('plain notes, even ones named like the section, are not protected', () => {
    for (const path of [
      String.raw`E:\Notes\Plan.md`,
      String.raw`E:\Notes\.mdx-notes\trash\Plan.md`,
      String.raw`E:\Notes\protected\Plan.md`,
      String.raw`E:\Notes\.mdx-notes-protected\Plan.md`,
    ]) {
      expect(isProtectedLocation(InMemoryDocumentFiles.locationOf(path)), path).toBe(false);
    }
  });

  it('leaves out the protected items of a list and keeps the order of the others', () => {
    const plan = InMemoryDocumentFiles.locationOf(String.raw`E:\Notes\Plan.md`);
    const inbox = InMemoryDocumentFiles.locationOf(String.raw`E:\Notes\Inbox.md`);
    const secret = protectedNoteLocation('e:\\notes', 'ab', 'Secret');

    expect(withoutProtectedLocations([plan, secret, inbox], (location) => location)).toEqual([plan, inbox]);
  });
});
