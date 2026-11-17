import type { MarkdownIt, StateCore, Token } from 'markdown-it';
import type { SpecCrossLinks, SpecStructureEnvironment } from './specStructurePlugin';

const LABEL_OR_IDENTIFIER = /\[(US\d+)\]|\b((?:FR|SC)-\d{3,})\b/g;
const DELTA_SECTION_LINE = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements(?:[ \t]+#+)?\s*$/i;
const NAMED_REQUIREMENT = /^\s*(?:[-*+]\s*)?(?:FROM:\s*)?`?###\s*Requirement:\s*(.+?)`?\s*$/i;
const LINKED_SECTIONS = new Set(['modified', 'removed', 'renamed']);

interface LinkingState {
  readonly core: StateCore;
  readonly links: SpecCrossLinks;
}

function linkAround(state: LinkingState, href: string, children: readonly Token[]): Token[] {
  const open = new state.core.Token('link_open', 'a', 1);
  open.attrSet('href', href);
  return [open, ...children, new state.core.Token('link_close', 'a', -1)];
}

function textToken(state: LinkingState, content: string): Token {
  const token = new state.core.Token('text', '', 0);
  token.content = content;
  return token;
}

/** Splits a text token around the story labels and identifiers that have a target; unknown ones stay text. */
function linkedText(state: LinkingState, token: Token): Token[] {
  const { storyLinks, requirementIdLinks } = state.links;
  const pieces: Token[] = [];
  let last = 0;
  for (const match of token.content.matchAll(LABEL_OR_IDENTIFIER)) {
    const href = match[1] !== undefined ? storyLinks?.get(match[1]) : requirementIdLinks?.get(match[2] ?? '');
    if (href === undefined) continue;
    if (match.index > last) pieces.push(textToken(state, token.content.slice(last, match.index)));
    pieces.push(...linkAround(state, href, [textToken(state, match[0])]));
    last = match.index + match[0].length;
  }
  if (last === 0) return [token];
  if (last < token.content.length) pieces.push(textToken(state, token.content.slice(last)));
  return pieces;
}

function linkedChild(state: LinkingState, child: Token): Token[] {
  if (child.type === 'text') return linkedText(state, child);
  const capabilityHref =
    child.type === 'code_inline' ? state.links.capabilityLinks?.get(child.content) : undefined;
  return capabilityHref === undefined ? [child] : linkAround(state, capabilityHref, [child]);
}

/** Links references inside an inline token, leaving anything already inside a link alone. */
function linkInline(state: LinkingState, inline: Token): void {
  const children = inline.children;
  if (!children) return;
  let linkDepth = 0;
  inline.children = children.flatMap((child) => {
    if (child.type === 'link_open') linkDepth += 1;
    if (child.type === 'link_close') linkDepth -= 1;
    return linkDepth > 0 || child.type === 'link_close' ? [child] : linkedChild(state, child);
  });
}

function sectionAfter(token: Token, line: string, section: string | undefined): string | undefined {
  const isTopLevelHeading = token.type === 'heading_open' && (token.tag === 'h1' || token.tag === 'h2');
  return isTopLevelHeading ? DELTA_SECTION_LINE.exec(line)?.[1]?.toLowerCase() : section;
}

/** The current-spec link for the requirement a heading or paragraph of a delta names, if any. */
function requirementHrefOf(
  links: ReadonlyMap<string, string>,
  inline: Token,
  line: string,
): string | undefined {
  const name = NAMED_REQUIREMENT.exec(inline.content)?.[1] ?? NAMED_REQUIREMENT.exec(line)?.[1];
  return name === undefined ? undefined : links.get(name.replace(/[ \t]+#+[ \t]*$/, '').trim());
}

/** In a delta's modified, removed and renamed sections, links each requirement name to the current spec. */
function linkRequirementNames(state: LinkingState, lines: readonly string[]): void {
  const requirementLinks = state.links.requirementLinks;
  if (!requirementLinks) return;
  let section: string | undefined;
  for (const [index, token] of state.core.tokens.entries()) {
    const line = lineOf(lines, token);
    section = sectionAfter(token, line, section);
    if (LINKED_SECTIONS.has(section ?? '')) linkNamedBlock(state, { requirementLinks, index, line });
  }
}

function lineOf(lines: readonly string[], token: Token): string {
  return lines[token.map?.[0] ?? -1] ?? '';
}

interface NamedBlock {
  readonly requirementLinks: ReadonlyMap<string, string>;
  readonly index: number;
  readonly line: string;
}

function linkNamedBlock(state: LinkingState, { requirementLinks, index, line }: NamedBlock): void {
  const token = state.core.tokens[index];
  const inline = state.core.tokens[index + 1];
  const isNamedBlock = token?.type === 'heading_open' || token?.type === 'paragraph_open';
  if (!isNamedBlock || !inline?.children) return;
  const href = requirementHrefOf(requirementLinks, inline, line);
  if (href !== undefined) inline.children = linkAround(state, href, inline.children);
}

/** Turns references between a spec project's documents into relative document links. */
export function specCrossLinksPlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.push('mdx_spec_cross_links', (core) => {
    const links = (core.env as SpecStructureEnvironment).specStructure?.links;
    if (!links) return;
    const state: LinkingState = { core, links };
    linkRequirementNames(state, core.src.split('\n'));
    for (const token of core.tokens) {
      if (token.type === 'inline') linkInline(state, token);
    }
  });
}
