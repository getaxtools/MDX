import { MAX_RICH_TEXT_DOCUMENT_BYTES, ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { InMemoryAppState, InMemoryDocumentFiles, type DocumentLocation } from '@mdx/platform';
import { describe, expect, it, vi } from 'vitest';
import { EditingModeActions } from './EditingModeActions';

const SMALL = 'C:\\Docs\\Small.md';
const LARGE = 'C:\\Docs\\Large.md';

async function editingModesWith(editedPath: string) {
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({
      [SMALL]: '# Small',
      [LARGE]: 'a'.repeat(MAX_RICH_TEXT_DOCUMENT_BYTES + 1),
    }),
    appState: new InMemoryAppState(),
    now: () => 0,
  });
  const opened = await session.openDocument(editedPath);
  const location: DocumentLocation = opened.location;
  const translator = createTranslator();
  const notices: string[] = [];
  const onChange = vi.fn();
  const modes = new EditingModeActions(session, {
    activeEditedLocation: () => location,
    showNotice: (key, values) => notices.push(translator.translate(key, values)),
    onChange,
  });
  return { modes, session, location, notices, onChange };
}

describe('editing mode actions', () => {
  it('a small document is edited in the mode of the setting', async () => {
    const { modes, location } = await editingModesWith(SMALL);

    expect(modes.modeFor(location.canonicalKey)).toBe('richText');
    modes.toggleMode();
    expect(modes.modeFor(location.canonicalKey)).toBe('source');
  });

  it('a document over 1 MB is edited in Source, and says why when editing starts', async () => {
    const { modes, location, notices } = await editingModesWith(LARGE);

    modes.explainSourceFor(location);

    expect(modes.modeFor(location.canonicalKey)).toBe('source');
    expect(notices).toEqual(['Large.md is larger than 1 MB, so it is edited in Source mode.']);
  });

  it('the setting stays Rich text after a refusal', async () => {
    const { modes, session, notices, onChange } = await editingModesWith(LARGE);

    modes.toggleMode();

    expect(session.currentState().viewSettings.editingMode).toBe('richText');
    expect(notices).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(modes.announcement()).toBeUndefined();
  });

  it('switching applies to every open editor and is announced once per change', async () => {
    const { modes, session } = await editingModesWith(SMALL);
    const other = await session.openDocument(LARGE);

    modes.changeMode('source');
    modes.changeMode('source');

    expect(modes.modeFor(other.location.canonicalKey)).toBe('source');
    expect(modes.announcement()).toEqual({ mode: 'source', number: 1 });
  });
});
