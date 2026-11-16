import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '../syntax/syntaxNode';

type SyntaxTree = ReturnType<typeof syntaxTree>;

/**
 * A link's address as written in the document, for the app to turn into the preview's href: a
 * destination of `[text](…)` or of a reference definition, an autolink's inside, or text the preview links.
 */
export interface WrittenLink {
  readonly destination: string;
  readonly form: 'destination' | 'autolink' | 'text';
}

/** Nodes whose `URL` child is part of the node, not an address written on its own. */
const URL_HOLDERS = new Set(['Link', 'Image', 'Autolink', 'LinkReference']);
/** Nodes that hold blocks, where reference definitions may be; nothing inside a paragraph is one. */
const BLOCK_CONTAINERS = new Set(['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem']);
/** How long finding a reference definition may parse the rest of the document. */
const REFERENCE_PARSE_TIMEOUT_MS = 200;
const LINKED_SCHEME = /^(?:https?:|ftp:|mailto:)/i;
const MAIL_ADDRESS = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

const definitionsByTree = new WeakMap<SyntaxTree, ReadonlyMap<string, string>>();

/** CommonMark's label matching, as markdown-it does it: no case and runs of white space as one space. */
function normalizedLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();
}

/** The definitions `[label]: destination` in a syntax tree, found once per tree, the first of a label winning. */
function linkDefinitions(state: EditorState, tree: SyntaxTree): ReadonlyMap<string, string> {
  const known = definitionsByTree.get(tree);
  if (known) return known;
  const definitions = new Map<string, string>();
  tree.iterate({
    enter: (node) => {
      if (BLOCK_CONTAINERS.has(node.name)) return undefined;
      if (node.name === 'LinkReference') addDefinition(state, node.node, definitions);
      return false;
    },
  });
  definitionsByTree.set(tree, definitions);
  return definitions;
}

function addDefinition(state: EditorState, definition: SyntaxNode, definitions: Map<string, string>): void {
  const label = definition.getChild('LinkLabel');
  const url = definition.getChild('URL');
  if (!label || !url) return;
  const name = normalizedLabel(state.sliceDoc(label.from + 1, label.to - 1));
  if (!definitions.has(name)) definitions.set(name, state.sliceDoc(url.from, url.to));
}

/** The label a reference link names: `[text][label]`, or its text for `[text][]` and `[text]`. */
function referenceLabelOf(state: EditorState, link: SyntaxNode): string | undefined {
  const [opening, closing] = link.getChildren('LinkMark');
  if (link.getChild('URL') || !opening || !closing) return undefined;
  const text = state.sliceDoc(opening.to, closing.from);
  const label = link.getChild('LinkLabel');
  const written = label ? state.sliceDoc(label.from + 1, label.to - 1) : '';
  const name = written.trim() === '' ? text : written;
  return name.startsWith('^') ? undefined : normalizedLabel(name);
}

/** A link the preview links: one with an address, or a reference whose definition is in the parsed text. */
export function hasLinkTarget(state: EditorState, link: SyntaxNode): boolean {
  if (link.getChild('URL')) return true;
  const label = referenceLabelOf(state, link);
  return label !== undefined && linkDefinitions(state, syntaxTree(state)).has(label);
}

/**
 * An address written as text that the preview turns into a link: one with a scheme, such as
 * `https://example.com`, or a mail address. The preview leaves `www.example.com` as text.
 */
export function isBareUrl(state: EditorState, url: SyntaxNode): boolean {
  if (url.name !== 'URL' || URL_HOLDERS.has(url.parent?.name ?? '')) return false;
  const written = state.sliceDoc(url.from, url.to);
  return LINKED_SCHEME.test(written) || MAIL_ADDRESS.test(written);
}

export function isInLink(state: EditorState, position: number): boolean {
  return linkNodeAt(state, position) !== undefined;
}

/** The link at a position, as written, for the app to open the way the preview opens it. */
export function linkAt(state: EditorState, position: number): WrittenLink | undefined {
  const node = linkNodeAt(state, position);
  if (!node) return undefined;
  if (node.name === 'Link') return writtenLinkOf(state, node);
  const url = node.name === 'URL' ? node : node.getChild('URL');
  if (!url) return undefined;
  return { destination: state.sliceDoc(url.from, url.to), form: node.name === 'URL' ? 'text' : 'autolink' };
}

function linkNodeAt(state: EditorState, position: number): SyntaxNode | undefined {
  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(position, side); node; node = node.parent) {
      if (node.name === 'Image') break;
      if (isLinkNode(state, node)) return node;
    }
  }
  return undefined;
}

function isLinkNode(state: EditorState, node: SyntaxNode): boolean {
  if (node.name === 'Link') return hasLinkTarget(state, node);
  return node.name === 'Autolink' || isBareUrl(state, node);
}

function writtenLinkOf(state: EditorState, link: SyntaxNode): WrittenLink | undefined {
  const url = link.getChild('URL');
  if (url) return { destination: state.sliceDoc(url.from, url.to), form: 'destination' };
  const label = referenceLabelOf(state, link);
  if (label === undefined) return undefined;
  const tree = ensureSyntaxTree(state, state.doc.length, REFERENCE_PARSE_TIMEOUT_MS) ?? syntaxTree(state);
  const destination = linkDefinitions(state, tree).get(label);
  return destination === undefined ? undefined : { destination, form: 'destination' };
}
