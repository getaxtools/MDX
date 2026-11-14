import {
  acceptCompletion,
  autocompletion,
  completionKeymap,
  completionStatus,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { keymap, type Command, type KeyBinding } from '@codemirror/view';
import { frontMatterEndOf } from '../blocks/markdownBlocks';
import { BUILT_IN_SLASH_ITEMS, type SlashMenuItem } from './slashMenuItems';

/** More items for the menu, such as note templates from a workspace kind or the user's snippets. */
export interface SlashMenuProvider {
  /** The group heading, as a CodeMirror phrase. */
  readonly section: string;
  items(state: EditorState): readonly SlashMenuItem[];
}

/** An ASCII slash, or the full-width solidus that Japanese and Chinese input methods commit. */
const SLASH_TEXT_BEFORE_CARET = /[/／][\p{L}\p{N}-]*$/u;
const NODES_WHERE_A_SLASH_IS_TEXT: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'CodeText',
  'HTMLBlock',
  'HTMLTag',
  'CommentBlock',
  'Comment',
  'URL',
  'LinkReference',
]);
export const SLASH_MENU_SECTION = 'Blocks';
const PROVIDED_SECTION_RANK = 1;

/** The insert menu: a slash at the start of a line or after a space offers blocks to insert. */
export function slashMenu(providers: readonly SlashMenuProvider[] = []): Extension {
  return [
    autocompletion({
      override: [(context) => slashCompletions(context, providers)],
      activateOnTyping: true,
      icons: false,
      defaultKeymap: false,
    }),
    Prec.highest(keymap.of(slashMenuKeys())),
  ];
}

/** The menu's own keys; Ctrl+Space stays free, because Microsoft Pinyin switches input with it. */
function slashMenuKeys(): KeyBinding[] {
  return [
    ...completionKeymap.filter((binding) => binding.run !== startCompletion),
    { key: 'Tab', run: acceptCompletion },
    { key: 'Home', run: selectOption((count) => (count > 0 ? 0 : -1)) },
    { key: 'End', run: selectOption((count) => count - 1) },
  ];
}

function selectOption(indexFor: (count: number) => number): Command {
  return (view) => {
    if (completionStatus(view.state) !== 'active') return false;
    const index = indexFor(currentCompletions(view.state).length);
    if (index < 0) return false;
    view.dispatch({ effects: setSelectedCompletion(index) });
    return true;
  };
}

export function slashCompletions(
  context: CompletionContext,
  providers: readonly SlashMenuProvider[] = [],
): CompletionResult | null {
  const { state, pos } = context;
  const match = context.matchBefore(SLASH_TEXT_BEFORE_CARET);
  if (!match || !isSlashAllowedAt(state, match.from)) return null;
  const query = match.text.slice(1).toLowerCase();
  const options = [
    ...optionsFor(BUILT_IN_SLASH_ITEMS, {
      section: { name: state.phrase(SLASH_MENU_SECTION), rank: 0 },
      state,
      query,
    }),
    ...providers.flatMap((provider) => providedOptions(provider, state, query)),
  ];
  if (options.length === 0) return null;
  return { from: match.from, to: pos, options, filter: false };
}

function isSlashAllowedAt(state: EditorState, slashPosition: number): boolean {
  const line = state.doc.lineAt(slashPosition);
  const before = state.sliceDoc(line.from, slashPosition);
  if (before !== '' && !/[ \t]$/.test(before)) return false;
  if (slashPosition < frontMatterEndOf(state.doc)) return false;
  if (isInsideMath(state, slashPosition)) return false;
  for (
    let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(
      slashPosition,
      -1,
    );
    node;
    node = node.parent
  ) {
    if (NODES_WHERE_A_SLASH_IS_TEXT.has(node.name)) return false;
    if (node.name === 'Link' && isInLinkTarget(state, node.from, slashPosition)) return false;
  }
  return true;
}

/** Math is not in the Markdown syntax tree: a `$$` block, or an odd number of `$` before the slash on its line. */
function isInsideMath(state: EditorState, position: number): boolean {
  const line = state.doc.lineAt(position);
  const dollarsBefore = state.sliceDoc(line.from, position).replace(/\\\$/g, '').split('$').length - 1;
  if (dollarsBefore % 2 === 1) return true;
  const textBefore = state.sliceDoc(0, line.from);
  return (textBefore.match(/^\s*\$\$\s*$/gm)?.length ?? 0) % 2 === 1;
}

function isInLinkTarget(state: EditorState, linkStart: number, position: number): boolean {
  const linkText = state.sliceDoc(linkStart, position);
  return linkText.includes('](');
}

function providedOptions(provider: SlashMenuProvider, state: EditorState, query: string): Completion[] {
  try {
    const section = { name: state.phrase(provider.section), rank: PROVIDED_SECTION_RANK };
    return optionsFor(provider.items(state), { section, state, query });
  } catch {
    return [];
  }
}

interface OptionContext {
  readonly section: CompletionSection;
  readonly state: EditorState;
  readonly query: string;
}

function optionsFor(items: readonly SlashMenuItem[], { section, state, query }: OptionContext): Completion[] {
  return items
    .map((item) => ({ item, score: matchScore(item, state, query) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score)
    .map(({ item, score }) => ({
      label: state.phrase(item.name),
      detail: state.phrase(item.description),
      section,
      boost: score,
      // CodeMirror calls apply with these four arguments.
      // eslint-disable-next-line max-params
      apply: (view, _completion, from, to) => {
        view.dispatch({
          ...item.insert(view.state, { from, to }),
          userEvent: 'input.complete',
          scrollIntoView: true,
        });
      },
    }));
}

const SCORE_NAME_PREFIX = 3;
const SCORE_WORD_PREFIX = 2;
const SCORE_CONTAINS = 1;

/** Best first: the start of a name, then the start of an alias or a word, then anywhere. */
function matchScore(item: SlashMenuItem, state: EditorState, query: string): number {
  if (query === '') return SCORE_CONTAINS;
  const names = [state.phrase(item.name), item.name].map((name) => name.toLowerCase());
  if (names.some((name) => name.startsWith(query))) return SCORE_NAME_PREFIX;
  const words = [...names.flatMap((name) => name.split(/\s+/)), ...item.aliases];
  if (words.some((word) => word.startsWith(query))) return SCORE_WORD_PREFIX;
  return names.some((name) => name.includes(query)) ? SCORE_CONTAINS : 0;
}
