import {
  DocumentOpenError,
  InMemoryAppState,
  InMemoryDocumentFiles,
  protectedNoteLocation,
  type OpenedDocument,
} from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { ViewerSession } from './ViewerSession';

const GUIDE_PATH = 'C:\\Docs\\Guide.md';
const LOCATION_KEY = 'c:\\notes';
const BANK_NOTE = protectedNoteLocation(LOCATION_KEY, 'a'.repeat(32), 'Bank details');

function createSession() {
  const documentFiles = new InMemoryDocumentFiles({ [GUIDE_PATH]: '# Guide', 'Bank details': 'plain copy' });
  const session = new ViewerSession({ documentFiles, appState: new InMemoryAppState(), now: () => 1 });
  return { session, documentFiles };
}

function protectedDocument(text: string, overrides: Partial<OpenedDocument> = {}): OpenedDocument {
  return {
    location: BANK_NOTE,
    text,
    encoding: 'utf-8',
    hasByteOrderMark: false,
    lineEnding: 'lf',
    modifiedAtMs: 1,
    ...overrides,
  };
}

const tabKeysOf = (session: ViewerSession) =>
  session
    .currentState()
    .tabStrip.tabs()
    .map((tab) => tab.location.canonicalKey);

describe('protected notes in the session', () => {
  it('opens a protected note in a tab from its decrypted text, outside recent files', async () => {
    const { session } = createSession();

    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());

    expect(tabKeysOf(session)).toEqual([BANK_NOTE.canonicalKey]);
    expect(session.currentState().recentFiles.entries()).toEqual([]);
    expect((await session.loadActiveDocument())?.text).toBe('PIN 4821');
  });

  it('never reads a file for a protected tab whose text it does not hold', async () => {
    const { session, documentFiles } = createSession();
    const open = vi.spyOn(documentFiles, 'open');
    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());
    session.clearAllData();
    session.updateTabs((tabStrip) => tabStrip.openOrFocus(BANK_NOTE));

    const loaded = await session.loadActiveDocument();

    expect(loaded).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses a document that is not a protected note', () => {
    const { session } = createSession();

    expect(() =>
      session.openProtectedNote(
        protectedDocument('# Guide', {
          location: { canonicalKey: GUIDE_PATH.toLowerCase(), displayPath: GUIDE_PATH, fileName: 'Guide.md' },
        }),
        vi.fn(),
      ),
    ).toThrow(DocumentOpenError);
  });

  it('saves edited text through its section in the note line breaks, never as a file', async () => {
    const { session, documentFiles } = createSession();
    const saveText = vi.fn(() => Promise.resolve());
    session.openProtectedNote(protectedDocument('PIN\r\n4821', { lineEnding: 'crlf' }), saveText);

    await session.saveEditedDocument(BANK_NOTE.canonicalKey, 'PIN\n4822');

    expect(saveText).toHaveBeenCalledWith('PIN\r\n4822');
    expect(documentFiles.savedSources).toEqual([]);
    expect(session.openedDocument(BANK_NOTE.canonicalKey)?.text).toBe('PIN\r\n4822');
  });

  it('refuses to save over a note whose text was not read cleanly', async () => {
    const { session } = createSession();
    const saveText = vi.fn(() => Promise.resolve());
    session.openProtectedNote(protectedDocument('PIN \uFFFD', { hasDecodingErrors: true }), saveText);

    await expect(session.saveEditedDocument(BANK_NOTE.canonicalKey, 'PIN 4821')).rejects.toThrow(
      DocumentOpenError,
    );
    expect(saveText).not.toHaveBeenCalled();
  });

  it('refuses Save As, which would write the note in plain text', async () => {
    const { session, documentFiles } = createSession();
    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());
    documentFiles.saveAsChoices.push('C:\\Docs\\Bank.md');

    await expect(session.saveDocumentAs(BANK_NOTE.canonicalKey, 'PIN 4821')).rejects.toThrow(
      DocumentOpenError,
    );
    expect(documentFiles.savedSources).toEqual([]);
  });

  it('closes every tab of a section that locks and forgets their text', async () => {
    const { session } = createSession();
    await session.openDocument(GUIDE_PATH);
    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());

    session.closeProtectedNotesOf(LOCATION_KEY);

    expect(tabKeysOf(session)).toEqual([GUIDE_PATH.toLowerCase()]);
    expect(session.openedDocument(BANK_NOTE.canonicalKey)).toBeUndefined();
  });

  it('leaves the notes of another section open', () => {
    const { session } = createSession();
    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());

    session.closeProtectedNotesOf('d:\\other notes');

    expect(tabKeysOf(session)).toEqual([BANK_NOTE.canonicalKey]);
  });

  it('forgets the text of a protected tab once it closes, and cannot reopen it', () => {
    const { session } = createSession();
    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());

    session.updateTabs((tabStrip) => tabStrip.close(BANK_NOTE.canonicalKey));
    session.updateTabs((tabStrip) => tabStrip.reopenLastClosed());

    expect(session.openedDocument(BANK_NOTE.canonicalKey)).toBeUndefined();
    expect(tabKeysOf(session)).toEqual([]);
  });

  it('does not reload a protected tab when a file with its title changes', async () => {
    const { session, documentFiles } = createSession();
    session.openProtectedNote(protectedDocument('PIN 4821'), vi.fn());
    const open = vi.spyOn(documentFiles, 'open');

    await session.reloadDocuments(['Bank details']);
    await session.reopenWithEncoding(BANK_NOTE.canonicalKey, 'windows-1252');

    expect(open).not.toHaveBeenCalled();
    expect(session.openedDocument(BANK_NOTE.canonicalKey)?.text).toBe('PIN 4821');
  });
});
