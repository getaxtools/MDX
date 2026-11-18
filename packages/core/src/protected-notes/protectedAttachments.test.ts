import type { ProtectedNoteSummary } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import {
  protectedAttachmentFor,
  protectedAttachmentMediaType,
  protectedAttachmentPath,
} from './protectedAttachments';

function listed(
  note: Pick<ProtectedNoteSummary, 'noteId' | 'title' | 'folder' | 'kind'>,
): ProtectedNoteSummary {
  return { ...note, modifiedMs: 1, state: 'current' };
}

const SECTION: readonly ProtectedNoteSummary[] = [
  listed({ noteId: 'a'.repeat(32), title: 'Chart 1.png', folder: 'Attachments', kind: 'attachment' }),
  listed({ noteId: 'b'.repeat(32), title: 'Chart 1.png', folder: 'Finance', kind: 'note' }),
  listed({ noteId: 'c'.repeat(32), title: 'scan.jpg', folder: 'Attachments', kind: 'attachment' }),
];

describe('protected attachments', () => {
  it('links from a note in any folder to the Attachments folder at the top of the section', () => {
    expect(protectedAttachmentPath('', 'Chart 1.png')).toBe('Attachments/Chart 1.png');
    expect(protectedAttachmentPath('Finance/2026', 'scan.jpg')).toBe('../../Attachments/scan.jpg');
  });

  it('finds the attachment a link names, encoded or not, and only an attachment', () => {
    expect(protectedAttachmentFor(SECTION, 'Finance', '../Attachments/Chart%201.png')).toBe('a'.repeat(32));
    expect(protectedAttachmentFor(SECTION, '', 'Attachments/SCAN.JPG')).toBe('c'.repeat(32));
    expect(protectedAttachmentFor(SECTION, 'Finance', 'Chart%201.png')).toBeUndefined();
  });

  it('shows nothing for links that leave the section, are absolute or cannot be read', () => {
    expect(protectedAttachmentFor(SECTION, '', '../Attachments/scan.jpg')).toBeUndefined();
    expect(protectedAttachmentFor(SECTION, '', 'C:/Attachments/scan.jpg')).toBeUndefined();
    expect(protectedAttachmentFor(SECTION, '', '/Attachments/scan.jpg')).toBeUndefined();
    expect(protectedAttachmentFor(SECTION, '', 'Attachments/%E0%A4%A.png')).toBeUndefined();
  });

  it('gives each picture extension the section uses its media type', () => {
    expect(protectedAttachmentMediaType('chart.PNG')).toBe('image/png');
    expect(protectedAttachmentMediaType('logo.svg')).toBe('image/svg+xml');
    expect(protectedAttachmentMediaType('notes.txt')).toBeUndefined();
  });
});
