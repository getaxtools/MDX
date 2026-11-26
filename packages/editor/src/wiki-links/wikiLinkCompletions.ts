import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

/** A note offered after `[[`. */
export interface WikiLinkNote {
  readonly name: string;
  /** What the link names: the note's name, or its path when the name would mean a nearer note. */
  readonly target: string;
  /** The folder the note is in, shown beside it; empty at the top of the notes folder. */
  readonly folder: string;
  /** The alias that matched, kept as the link's text. */
  readonly alias: string | null;
}

export interface WikiLinkHeading {
  readonly level: number;
  readonly text: string;
}

/** Where wiki-link suggestions come from, such as the index of a Notes workspace. */
export interface WikiLinkSuggester {
  /** Notes whose name or alias starts with what was typed, the nearest first. */
  notes(typed: string): Promise<readonly WikiLinkNote[]>;
  /** The headings of the note a link target means; an empty target is the note being edited. */
  headings(target: string): Promise<readonly WikiLinkHeading[]>;
}

const WIKI_LINK_BEFORE_CARET = /\[\[[^[\]|#\n]*(#[^[\]|\n]*)?$/u;
const OPENING = '[[';
const CLOSING = ']]';
const NODES_WITHOUT_LINKS: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'CodeText',
  'HTMLBlock',
  'CommentBlock',
]);

/** Suggests notes after `[[`, then the chosen note's headings after `#`. */
export function wikiLinkCompletions(suggester: WikiLinkSuggester): CompletionSource {
  return async (context) => {
    if (context.view?.composing === true) return null;
    const match = context.matchBefore(WIKI_LINK_BEFORE_CARET);
    if (!match || isInsideCode(context, match.from)) return null;
    const inner = match.text.slice(OPENING.length);
    const hashAt = inner.indexOf('#');
    const from = match.from + OPENING.length;
    return hashAt < 0
      ? noteOptions(context, suggester, { from, typed: inner })
      : headingOptions(context, suggester, { from: from + hashAt + 1, target: inner.slice(0, hashAt) });
  };
}

async function noteOptions(
  context: CompletionContext,
  suggester: WikiLinkSuggester,
  { from, typed }: { readonly from: number; readonly typed: string },
): Promise<CompletionResult | null> {
  const notes = await suggester.notes(typed);
  if (context.aborted || notes.length === 0) return null;
  return {
    from,
    to: context.pos,
    filter: false,
    options: notes.map((note) => ({
      label: note.alias ?? note.name,
      ...(note.alias ? { detail: note.name } : {}),
      ...(note.folder ? { info: note.folder } : {}),
      type: 'text',
      apply: insertLinkEnd(note.alias ? `${note.target}|${note.alias}` : note.target),
    })),
  };
}

async function headingOptions(
  context: CompletionContext,
  suggester: WikiLinkSuggester,
  { from, target }: { readonly from: number; readonly target: string },
): Promise<CompletionResult | null> {
  const headings = await suggester.headings(target.trim());
  if (context.aborted || headings.length === 0) return null;
  const typed = context.state.sliceDoc(from, context.pos).toLowerCase();
  const options: Completion[] = headings
    .filter((heading) => heading.text.toLowerCase().includes(typed))
    .map((heading) => ({
      label: heading.text,
      detail: '#'.repeat(heading.level),
      type: 'text',
      apply: insertLinkEnd(heading.text),
    }));
  return options.length > 0 ? { from, to: context.pos, filter: false, options } : null;
}

/** Puts the chosen text in place and closes the link, using brackets that are already there. */
type ApplyArguments = [view: EditorView, completion: Completion, from: number, to: number];

function insertLinkEnd(text: string): (...applied: ApplyArguments) => void {
  return (...[view, , from, to]: ApplyArguments) => {
    const hasClosing = view.state.sliceDoc(to, to + CLOSING.length) === CLOSING;
    const end = hasClosing ? to + CLOSING.length : to;
    view.dispatch({
      changes: { from, to: end, insert: `${text}${CLOSING}` },
      selection: { anchor: from + text.length + CLOSING.length },
      userEvent: 'input.complete',
    });
  };
}

function isInsideCode(context: CompletionContext, position: number): boolean {
  for (
    let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(context.state).resolveInner(
      position,
      1,
    );
    node;
    node = node.parent
  ) {
    if (NODES_WITHOUT_LINKS.has(node.name)) return true;
  }
  return false;
}
