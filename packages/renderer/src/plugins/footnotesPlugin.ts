import type { MarkdownIt, RendererRule, StateCore, Token } from 'markdown-it';
import footnotes from 'markdown-it-footnote';
import { HEADING_ID_PREFIX } from './headingAnchorsPlugin';

const FOOTNOTE_ID_OR_LINK = /(id="|href="#)(fn)/g;
const RULES_WITH_FOOTNOTE_IDS = ['footnote_ref', 'footnote_open', 'footnote_anchor'] as const;

interface FootnoteEntry {
  readonly label?: string;
  readonly count: number;
  readonly tokens?: Token[];
  readonly content?: string;
}

interface FootnoteEnvironment {
  readonly footnotes?: { readonly list?: readonly FootnoteEntry[] };
}

/** Footnotes whose ids carry the prefix that the sanitizer keeps, so their links keep working. */
export function footnotesPlugin(markdown: MarkdownIt): void {
  markdown.use(footnotes);
  markdown.core.ruler.at('footnote_tail', appendFootnotes);
  for (const ruleName of RULES_WITH_FOOTNOTE_IDS) {
    const render = markdown.renderer.rules[ruleName];
    if (render) markdown.renderer.rules[ruleName] = withPrefixedIds(render);
  }
}

function withPrefixedIds(render: RendererRule): RendererRule {
  return (...ruleArguments) =>
    render(...ruleArguments).replace(FOOTNOTE_ID_OR_LINK, `$1${HEADING_ID_PREFIX}$2`);
}

/**
 * Moves the footnote definitions to the end of the document, giving the same tokens as the
 * plugin's own rule. That rule copies the whole token list for every footnote, which takes minutes
 * for a long document with thousands of footnotes; this one appends in place.
 */
function appendFootnotes(state: StateCore): void {
  const environment = state.env as FootnoteEnvironment;
  if (!environment.footnotes) return;
  const { tokens, definitions } = withoutDefinitions(state.tokens);
  state.tokens = tokens;
  const list = environment.footnotes.list;
  if (!list) return;
  tokens.push(new state.Token('footnote_block_open', '', 1));
  let body: readonly Token[] | undefined;
  list.forEach((entry, id) => {
    const open = new state.Token('footnote_open', '', 1);
    open.meta = { id, label: entry.label };
    tokens.push(open);
    // An entry with neither repeats the body before it, as the plugin's own rule does.
    if (entry.tokens) body = paragraphOf(state, entry.tokens, entry.content ?? '');
    else if (entry.label !== undefined && entry.label !== '') body = definitions.get(entry.label);
    for (const token of body ?? []) tokens.push(token);
    appendBackLinks(state, entry, id);
    tokens.push(new state.Token('footnote_close', '', -1));
  });
  tokens.push(new state.Token('footnote_block_close', '', -1));
}

function withoutDefinitions(allTokens: readonly Token[]): {
  tokens: Token[];
  definitions: Map<string, Token[]>;
} {
  const tokens: Token[] = [];
  const definitions = new Map<string, Token[]>();
  let definition: Token[] | undefined;
  let label = '';
  for (const token of allTokens) {
    if (token.type === 'footnote_reference_open') {
      definition = [];
      label = (token.meta as { label: string }).label;
    } else if (token.type === 'footnote_reference_close') {
      definitions.set(label, definition ?? []);
      definition = undefined;
    } else if (definition) definition.push(token);
    else tokens.push(token);
  }
  return { tokens, definitions };
}

function paragraphOf(state: StateCore, children: Token[], content: string): Token[] {
  const open = new state.Token('paragraph_open', 'p', 1);
  open.block = true;
  const inline = new state.Token('inline', '', 0);
  inline.children = children;
  inline.content = content;
  const close = new state.Token('paragraph_close', 'p', -1);
  close.block = true;
  return [open, inline, close];
}

/** The links back to each reference go inside the footnote's last paragraph. */
function appendBackLinks(state: StateCore, entry: FootnoteEntry, id: number): void {
  const { tokens } = state;
  const lastParagraph = tokens.at(-1)?.type === 'paragraph_close' ? tokens.pop() : undefined;
  const references = entry.count > 0 ? entry.count : 1;
  for (let subId = 0; subId < references; subId += 1) {
    const anchor = new state.Token('footnote_anchor', '', 0);
    anchor.meta = { id, subId, label: entry.label };
    tokens.push(anchor);
  }
  if (lastParagraph) tokens.push(lastParagraph);
}
