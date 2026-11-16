import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

/** Nodes whose `URL` child is part of the node, not an address written on its own. */
const URL_HOLDERS = new Set(['Link', 'Image', 'Autolink', 'LinkReference']);
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const BACKSLASH_ESCAPE = /\\([!-/:-@[-`{-~])/g;
const ANGLE_BRACKETS = /^<(.*)>$/s;
/** How long finding a reference definition may parse the rest of the document. */
const REFERENCE_PARSE_TIMEOUT_MS = 200;

/** A link that names an address: `[text](address)` or `[text][label]`, not a lone `[text]`. */
export function hasLinkTarget(link: SyntaxNode): boolean {
  return link.getChild('URL') !== null || link.getChild('LinkLabel') !== null;
}

/** An address written as text, such as `www.example.com`, which the preview turns into a link. */
export function isBareUrl(url: SyntaxNode): boolean {
  return url.name === 'URL' && !URL_HOLDERS.has(url.parent?.name ?? '');
}

export function isInLink(state: EditorState, position: number): boolean {
  return linkNodeAt(state, position) !== undefined;
}

/** The address the link at a position opens, as the preview's link would have it. */
export function linkAddressAt(state: EditorState, position: number): string | undefined {
  const node = linkNodeAt(state, position);
  if (!node) return undefined;
  if (node.name === 'Link') return linkAddressOf(state, node);
  const url = node.name === 'URL' ? node : node.getChild('URL');
  return url ? addressOfWrittenUrl(state.sliceDoc(url.from, url.to)) : undefined;
}

function linkNodeAt(state: EditorState, position: number): SyntaxNode | undefined {
  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(position, side); node; node = node.parent) {
      if (node.name === 'Image') break;
      if (isLinkNode(node)) return node;
    }
  }
  return undefined;
}

function isLinkNode(node: SyntaxNode): boolean {
  if (node.name === 'Link') return hasLinkTarget(node);
  return node.name === 'Autolink' || isBareUrl(node);
}

function linkAddressOf(state: EditorState, link: SyntaxNode): string | undefined {
  const url = link.getChild('URL');
  if (url) return unescaped(state.sliceDoc(url.from, url.to).replace(ANGLE_BRACKETS, '$1'));
  const label = link.getChild('LinkLabel');
  if (!label) return undefined;
  const written = state.sliceDoc(label.from + 1, label.to - 1);
  const [opening, closing] = link.getChildren('LinkMark');
  const name =
    written.trim() === '' && opening && closing ? state.sliceDoc(opening.to, closing.from) : written;
  return referenceAddress(state, name);
}

/** The address of the definition `[label]: address` that a reference link names. */
function referenceAddress(state: EditorState, label: string): string | undefined {
  const wanted = normalizedLabel(label);
  const tree = ensureSyntaxTree(state, state.doc.length, REFERENCE_PARSE_TIMEOUT_MS) ?? syntaxTree(state);
  let address: string | undefined;
  tree.iterate({
    enter: (node) => {
      if (address !== undefined || node.name !== 'LinkReference') return address === undefined;
      const definitionLabel = node.node.getChild('LinkLabel');
      const url = node.node.getChild('URL');
      if (!definitionLabel || !url) return false;
      const name = state.sliceDoc(definitionLabel.from + 1, definitionLabel.to - 1);
      if (normalizedLabel(name) === wanted) address = unescaped(state.sliceDoc(url.from, url.to));
      return false;
    },
  });
  return address?.replace(ANGLE_BRACKETS, '$1');
}

/** CommonMark matches labels without case and with runs of white space as one space. */
function normalizedLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** An autolink or a bare address, completed the way the preview completes it. */
function addressOfWrittenUrl(written: string): string {
  if (HAS_SCHEME.test(written)) return written;
  if (written.includes('@')) return `mailto:${written}`;
  return `http://${written}`;
}

function unescaped(address: string): string {
  return address.replace(BACKSLASH_ESCAPE, '$1');
}
