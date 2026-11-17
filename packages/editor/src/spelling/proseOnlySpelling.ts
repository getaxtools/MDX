import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

export interface TextRange {
  readonly from: number;
  readonly to: number;
}

/** Text that is not prose: its words are names, addresses or markup, not words to spell. */
const NODES_THAT_ARE_NOT_PROSE = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'InlineMath',
  'DisplayMath',
  'URL',
  'Autolink',
  'HTMLBlock',
  'HTMLTag',
  'Comment',
  'CommentBlock',
  'ProcessingInstructionBlock',
  'FrontMatter',
]);
/** The renderer's wiki-link rule; the target is a note's name, not a word to spell. */
const WIKI_LINK = /\[\[[^[\]\n]+\]\]/g;

const NOT_SPELL_CHECKED = Decoration.mark({ attributes: { spellcheck: 'false' } });

/**
 * The stretches between `from` and `to` that are not prose: code, math, web addresses and link
 * targets, front matter, HTML and wiki-link targets.
 */
export function nonProseRanges(state: EditorState, { from, to }: TextRange): TextRange[] {
  const ranges: TextRange[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (!NODES_THAT_ARE_NOT_PROSE.has(node.name)) return undefined;
      ranges.push({ from: node.from, to: node.to });
      return false;
    },
  });
  const text = state.sliceDoc(from, to);
  for (const match of text.matchAll(WIKI_LINK))
    ranges.push({ from: from + match.index, to: from + match.index + match[0].length });
  return ranges.sort((first, second) => first.from - second.from || first.to - second.to);
}

function decorationsOf(view: EditorView): DecorationSet {
  const marks = view.visibleRanges.flatMap((visible) =>
    nonProseRanges(view.state, visible)
      .filter((range) => range.to > range.from)
      .map((range) => NOT_SPELL_CHECKED.range(range.from, range.to)),
  );
  return Decoration.set(marks, true);
}

// Marks change only with the text or what is on screen, so they do not redraw while someone composes.
const proseOnlyMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorationsOf(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = decorationsOf(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Turns the operating system's spell check on for the editor's prose, or off everywhere. */
export function spellCheckExtension(isOn: boolean): Extension {
  return isOn
    ? [EditorView.contentAttributes.of({ spellcheck: 'true' }), proseOnlyMarks]
    : EditorView.contentAttributes.of({ spellcheck: 'false' });
}
