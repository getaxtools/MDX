import { describe, expect, it } from 'vitest';
import { altTextOf, attachmentLinkTarget, imageMarkdown, pastedImageName } from './attachmentLinks';

describe('attachment links', () => {
  it('space becomes %20', () => {
    expect(attachmentLinkTarget('assets/team photo.png')).toBe('assets/team%20photo.png');
  });

  it('parentheses are encoded', () => {
    expect(attachmentLinkTarget('assets/chart (1).png')).toBe('assets/chart%20%281%29.png');
  });

  it('uses forward slashes', () => {
    expect(attachmentLinkTarget('assets\\2026\\a.png')).toBe('assets/2026/a.png');
  });

  it('non-ASCII names are kept', () => {
    expect(attachmentLinkTarget('assets/Größe.png')).toBe('assets/Größe.png');
  });

  it('alt text comes from the file name', () => {
    expect(altTextOf('team-photo_2.png')).toBe('team photo 2');
  });

  it('writes an image link', () => {
    expect(imageMarkdown('assets/team photo.png')).toBe('![team photo](assets/team%20photo.png)');
  });

  it('pasted name uses the document name and time', () => {
    expect(pastedImageName('Guide.md', new Date(2026, 10, 13, 9, 5, 7))).toBe(
      'Guide 2026-11-13 09-05-07.png',
    );
  });
});
