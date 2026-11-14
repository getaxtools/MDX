import type { MarkdownIt, StateInline } from 'markdown-it';
import { HEADING_ID_PREFIX, slugify } from './headingAnchorsPlugin';

/** What a Notes workspace tells the renderer about its notes. */
export interface NotesRendering {
  /** The address of the note a wiki-link target names, relative to the shown note; undefined if none. */
  resolveWikiLink(target: string): string | undefined;
  /** Read by screen readers after a link to a note that does not exist yet, such as "no note yet". */
  readonly unresolvedDescription: string;
}

const OPENING = '[[';
const CLOSING = ']]';
const TAG = /^#([\p{L}\p{N}_/-]+)/u;
const NUMBER_ONLY = /^\p{N}+$/u;
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

/**
 * Notes syntax: `[[Note#Heading|text]]` links between notes and `#tag` marks topics. Both are
 * inline rules, so code spans and code blocks are never linked; all text goes out as text tokens.
 */
export function wikiLinksPlugin(markdown: MarkdownIt, notes: NotesRendering): void {
  markdown.inline.ruler.before('link', 'mdx_wiki_link', (state, isSilent) =>
    wikiLink(state, isSilent, notes),
  );
  markdown.inline.ruler.push('mdx_tag', tag);
}

function wikiLink(state: StateInline, isSilent: boolean, notes: NotesRendering): boolean {
  if (!state.src.startsWith(OPENING, state.pos)) return false;
  const end = state.src.indexOf(CLOSING, state.pos + OPENING.length);
  if (end === -1) return false;
  const inner = state.src.slice(state.pos + OPENING.length, end);
  if (inner.trim() === '' || /[[\]\n]/.test(inner)) return false;
  if (!isSilent) pushWikiLink(state, inner, notes);
  state.pos = end + CLOSING.length;
  return true;
}

interface WikiLinkParts {
  readonly target: string;
  readonly heading: string;
  readonly text: string;
}

function partsOf(inner: string): WikiLinkParts {
  const [destination = '', shownText] = inner.split('|', 2);
  const [rawTarget = '', rawHeading] = destination.split('#', 2);
  const target = rawTarget.trim().replace(MARKDOWN_EXTENSION, '');
  const heading = rawHeading?.trim() ?? '';
  const ownText = shownText?.trim() ?? '';
  const text = ownText === '' ? [target, heading].filter(Boolean).join(' > ') : ownText;
  return { target, heading, text };
}

function pushWikiLink(state: StateInline, inner: string, notes: NotesRendering): void {
  const { target, heading, text } = partsOf(inner);
  const address = target === '' ? '' : notes.resolveWikiLink(target);
  if (address === undefined) {
    pushUnresolved(state, { target, heading, text }, notes);
    return;
  }
  const anchor = heading === '' ? '' : `#${HEADING_ID_PREFIX}${slugify(heading)}`;
  const open = state.push('link_open', 'a', 1);
  open.attrSet('href', `${address}${anchor}`);
  open.attrSet('class', 'wiki-link');
  state.push('text', '', 0).content = text;
  state.push('link_close', 'a', -1);
}

function pushUnresolved(state: StateInline, { target, text }: WikiLinkParts, notes: NotesRendering): void {
  const open = state.push('wiki_link_unresolved_open', 'span', 1);
  open.attrSet('class', 'wiki-link wiki-link-unresolved');
  open.attrSet('title', target);
  state.push('text', '', 0).content = text;
  const description = state.push('wiki_link_description_open', 'span', 1);
  description.attrSet('class', 'visually-hidden');
  state.push('text', '', 0).content = ` (${notes.unresolvedDescription})`;
  state.push('wiki_link_description_close', 'span', -1);
  state.push('wiki_link_unresolved_close', 'span', -1);
}

/** A tag starts a word, holds letters, digits, `_`, `-` or `/`, and is never only a number. */
function tag(state: StateInline, isSilent: boolean): boolean {
  if (state.src.charAt(state.pos) !== '#') return false;
  const previous = state.pos === 0 ? '' : state.src.charAt(state.pos - 1);
  if (previous !== '' && !/\s/.test(previous)) return false;
  const name = TAG.exec(state.src.slice(state.pos))?.[1];
  if (!name || NUMBER_ONLY.test(name)) return false;
  if (!isSilent) {
    const open = state.push('tag_open', 'span', 1);
    open.attrSet('class', 'tag');
    state.push('text', '', 0).content = `#${name}`;
    state.push('tag_close', 'span', -1);
  }
  state.pos += name.length + 1;
  return true;
}
