import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hiddenCharacterMarkers,
  markedRangesField,
  setMarkedRanges,
  type FoundHiddenCharacter,
  type HiddenCharacterFinder,
} from './hiddenCharacters';

const ZERO_WIDTH_JOINER = '\u200D';
const FAMILY_EMOJI = `\u{1F468}${ZERO_WIDTH_JOINER}\u{1F469}${ZERO_WIDTH_JOINER}\u{1F467}`;

/** Stands in for the app's character list: joiners between letters are hidden, between emoji they join. */
const findJoiners: HiddenCharacterFinder = (lineText) => {
  const found: FoundHiddenCharacter[] = [];
  for (
    let offset = lineText.indexOf(ZERO_WIDTH_JOINER);
    offset !== -1;
    offset = lineText.indexOf(ZERO_WIDTH_JOINER, offset + 1)
  ) {
    const isInSequence = /\p{Extended_Pictographic}/u.test(lineText.slice(Math.max(0, offset - 2), offset));
    found.push({
      from: offset,
      to: offset + 1,
      name: 'ZERO WIDTH JOINER',
      abbreviation: 'ZWJ',
      isInSequence,
    });
  }
  return found;
};

let view: EditorView | undefined;

function openView(text: string): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [hiddenCharacterMarkers(findJoiners), markedRangesField],
    }),
  });
  return view;
}

describe('hidden character markers', () => {
  afterEach(() => {
    view?.destroy();
    document.body.innerHTML = '';
  });

  it('draws a joiner between letters as a chip named after the character', () => {
    const editor = openView(`a${ZERO_WIDTH_JOINER}b`);

    const chip = editor.dom.querySelector('.cm-hidden-character');

    expect(chip?.getAttribute('role')).toBe('img');
    expect(chip?.getAttribute('aria-label')).toBe('zero width joiner');
    expect(chip?.textContent).toBe('ZWJ');
  });

  it('gives an emoji family no chip, only a faint outline, so it still draws as one picture', () => {
    const editor = openView(`Family ${FAMILY_EMOJI}`);

    expect(editor.dom.querySelector('.cm-hidden-character')).toBeNull();
    expect(editor.dom.querySelector('.cm-hidden-sequence')?.textContent).toBe(FAMILY_EMOJI);
  });

  it('leaves the text unchanged', () => {
    const text = `a${ZERO_WIDTH_JOINER}b ${FAMILY_EMOJI}`;

    const editor = openView(text);

    expect(editor.state.doc.toString()).toBe(text);
  });

  it('keeps an underlined range on the same text while the text before it is edited', () => {
    const editor = openView('one two three');
    editor.dispatch({ effects: setMarkedRanges.of([{ from: 4, to: 7 }]) });

    editor.dispatch({ changes: { from: 0, insert: 'zero ' } });

    expect(editor.dom.querySelector('.cm-marked-range')?.textContent).toBe('two');
  });
});
