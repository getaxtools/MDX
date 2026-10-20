import { describe, expect, it } from 'vitest';
import { DocumentEditing } from './DocumentEditing';

const GUIDE = 'c:\\docs\\guide.md';
const NOTES = 'c:\\docs\\notes.md';

describe('DocumentEditing', () => {
  it('switches a document between editing and preview', () => {
    const editing = new DocumentEditing();

    editing.toggleEditing(GUIDE);
    expect(editing.isEditing(GUIDE)).toBe(true);
    editing.toggleEditing(GUIDE);

    expect(editing.isEditing(GUIDE)).toBe(false);
  });

  it('keeps edited text only while it differs from the saved file', () => {
    const editing = new DocumentEditing();

    expect(editing.updateText(GUIDE, '# Changed', '# Guide')).toBe(true);
    expect(editing.editedTextOf(GUIDE)).toBe('# Changed');
    expect(editing.updateText(GUIDE, '# Changed again', '# Guide')).toBe(false);
    expect(editing.updateText(GUIDE, '# Guide', '# Guide')).toBe(true);

    expect(editing.hasUnsavedChanges(GUIDE)).toBe(false);
  });

  it('treats text that differs only in Windows line breaks as unchanged', () => {
    const editing = new DocumentEditing();

    editing.updateText(GUIDE, 'a\nb', 'a\r\nb');

    expect(editing.hasUnsavedChanges(GUIDE)).toBe(false);
  });

  it('lists the documents with unsaved changes and discards them on request', () => {
    const editing = new DocumentEditing();
    editing.updateText(GUIDE, 'x', '');
    editing.updateText(NOTES, 'y', '');

    editing.discardChanges(NOTES);

    expect([...editing.unsavedKeys()]).toEqual([GUIDE]);
  });

  it('forgets documents whose tabs were closed', () => {
    const editing = new DocumentEditing();
    editing.toggleEditing(GUIDE);
    editing.updateText(GUIDE, 'x', '');
    editing.toggleEditing(NOTES);

    editing.keepOnly(new Set([NOTES]));

    expect(editing.isEditing(GUIDE)).toBe(false);
    expect(editing.hasUnsavedChanges(GUIDE)).toBe(false);
    expect(editing.isEditing(NOTES)).toBe(true);
  });

  it('keeps editing a document under its new key after Save As', () => {
    const editing = new DocumentEditing();
    editing.toggleEditing('untitled:1');
    editing.updateText('untitled:1', 'x', '');

    editing.rename('untitled:1', GUIDE);

    expect(editing.isEditing(GUIDE)).toBe(true);
    expect(editing.hasUnsavedChanges(GUIDE)).toBe(false);
  });
});
