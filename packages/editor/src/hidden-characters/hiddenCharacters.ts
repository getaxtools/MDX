import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

/** A hidden character found in a stretch of text, by the app's own character list. */
export interface FoundHiddenCharacter {
  /** UTF-16 offsets in the stretch of text given. */
  readonly from: number;
  readonly to: number;
  /** The Unicode name, such as ZERO WIDTH JOINER. */
  readonly name: string;
  readonly abbreviation: string;
  /** Part of an emoji or a joined word, so it is outlined instead of replaced, which would break it. */
  readonly isInSequence: boolean;
}

/** Finds the hidden characters of one line; the editor asks only for lines on screen. */
export type HiddenCharacterFinder = (lineText: string) => readonly FoundHiddenCharacter[];

/** A range to underline, such as a prompt injection finding, by offsets in the editor's text. */
export interface MarkedRange {
  readonly from: number;
  readonly to: number;
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

class HiddenCharacterChip extends WidgetType {
  constructor(
    private readonly name: string,
    private readonly abbreviation: string,
  ) {
    super();
  }

  override eq(other: HiddenCharacterChip): boolean {
    return other.name === this.name && other.abbreviation === this.abbreviation;
  }

  toDOM(): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'cm-hidden-character';
    chip.setAttribute('role', 'img');
    // Unicode names are standard identifiers, read more easily in lower case.
    chip.setAttribute('aria-label', this.name.toLowerCase());
    chip.title = this.name;
    chip.textContent = this.abbreviation;
    return chip;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const sequenceOutline = Decoration.mark({ class: 'cm-hidden-sequence' });

/** The grapheme around a character, so an emoji or a joined word is outlined whole. */
function graphemeAround(lineText: string, offset: number): MarkedRange {
  const segment = GRAPHEMES.segment(lineText).containing(offset);
  return segment
    ? { from: segment.index, to: segment.index + segment.segment.length }
    : { from: offset, to: offset + 1 };
}

function lineDecorations(
  lineText: string,
  lineStart: number,
  findHiddenCharacters: HiddenCharacterFinder,
): Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  let outlinedUpTo = -1;
  for (const character of findHiddenCharacters(lineText)) {
    if (!character.isInSequence) {
      const chip = Decoration.replace({
        widget: new HiddenCharacterChip(character.name, character.abbreviation),
      });
      decorations.push(chip.range(lineStart + character.from, lineStart + character.to));
      continue;
    }
    const grapheme = graphemeAround(lineText, character.from);
    if (grapheme.from < outlinedUpTo) continue;
    outlinedUpTo = grapheme.to;
    decorations.push(sequenceOutline.range(lineStart + grapheme.from, lineStart + grapheme.to));
  }
  return decorations;
}

function visibleDecorations(view: EditorView, findHiddenCharacters: HiddenCharacterFinder): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let position = from; position <= to;) {
      const line = view.state.doc.lineAt(position);
      decorations.push(...lineDecorations(line.text, line.from, findHiddenCharacters));
      position = line.to + 1;
    }
  }
  return Decoration.set(decorations, true);
}

class HiddenCharacterMarkersView {
  decorations: DecorationSet;

  constructor(
    view: EditorView,
    private readonly findHiddenCharacters: HiddenCharacterFinder,
  ) {
    this.decorations = visibleDecorations(view, findHiddenCharacters);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged)
      this.decorations = visibleDecorations(update.view, this.findHiddenCharacters);
  }
}

/** Draws hidden characters as labelled chips, only for the lines on screen; the text never changes. */
export function hiddenCharacterMarkers(findHiddenCharacters: HiddenCharacterFinder): Extension {
  return [
    ViewPlugin.define((view) => new HiddenCharacterMarkersView(view, findHiddenCharacters), {
      decorations: (markers) => markers.decorations,
    }),
    hiddenCharacterTheme,
  ];
}

export const setMarkedRanges = StateEffect.define<readonly MarkedRange[]>();

const findingUnderline = Decoration.mark({ class: 'cm-marked-range' });

function markedRangesOf(state: EditorState, ranges: readonly MarkedRange[]): DecorationSet {
  const length = state.doc.length;
  const marks = ranges
    .map(({ from, to }) => ({ from: Math.min(from, length), to: Math.min(Math.max(from, to), length) }))
    .filter(({ from, to }) => to > from)
    .sort((left, right) => left.from - right.from)
    .map(({ from, to }) => findingUnderline.range(from, to));
  return Decoration.set(marks);
}

/** Underlines ranges, such as findings, and keeps them on the same text while it is edited. */
export const markedRangesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(setMarkedRanges)) next = markedRangesOf(transaction.state, effect.value);
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const hiddenCharacterTheme = EditorView.baseTheme({
  '.cm-hidden-character': {
    display: 'inline-block',
    padding: '0 0.2em',
    margin: '0 0.05em',
    border: '1px solid var(--color-alert-caution)',
    borderRadius: 'var(--radius-xsmall)',
    color: 'var(--color-alert-caution)',
    fontSize: '0.75em',
    lineHeight: '1.3',
    verticalAlign: 'middle',
  },
  '.cm-hidden-sequence': {
    outline: '1px dotted var(--color-text-tertiary)',
    borderRadius: 'var(--radius-xsmall)',
  },
  '.cm-marked-range': {
    textDecoration: 'underline wavy var(--color-alert-caution)',
    textUnderlineOffset: '0.2em',
  },
  '@media (forced-colors: active)': {
    '.cm-hidden-character': { borderColor: 'CanvasText', color: 'CanvasText', forcedColorAdjust: 'none' },
    '.cm-hidden-sequence': { outlineColor: 'CanvasText' },
  },
});
