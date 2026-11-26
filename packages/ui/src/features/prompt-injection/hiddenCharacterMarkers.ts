import { HiddenCharacterNames, listHiddenCharacters, type ListedHiddenCharacter } from '@mdx/core';

export const HIDDEN_CHARACTER_MARKER_CLASS = 'mdx-hidden-character';
const MARKER_SELECTOR = `.${HIDDEN_CHARACTER_MARKER_CLASS}`;
/** Typeset math and drawings are left alone, as are the app's own controls. */
const SKIPPED_SELECTOR = `.mdx-math-inline, .mdx-math-display, .katex, svg, math, button, ${MARKER_SELECTOR}`;
const FIRST_PRINTABLE_ASCII = 0x20;
const LAST_PRINTABLE_ASCII = 0x7e;

function hasNamedHiddenCharacter(text: string): boolean {
  const namedCharacters = HiddenCharacterNames.bundled().namedCodePoints();
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? FIRST_PRINTABLE_ASCII;
    const isPlainAscii = codePoint >= FIRST_PRINTABLE_ASCII && codePoint <= LAST_PRINTABLE_ASCII;
    if (!isPlainAscii && namedCharacters.has(codePoint)) return true;
  }
  return false;
}

function textNodesToMark(root: HTMLElement): Text[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIPPED_SELECTOR) || !hasNamedHiddenCharacter(node.nodeValue ?? '')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

/** The marker keeps the character as its text, so copying still gives the original; CSS draws the label. */
function markerFor(document: Document, character: ListedHiddenCharacter, text: string): HTMLElement {
  const marker = document.createElement('span');
  marker.className = HIDDEN_CHARACTER_MARKER_CLASS;
  marker.setAttribute('role', 'img');
  marker.setAttribute('aria-label', character.name.toLowerCase());
  marker.dataset.label = character.abbreviation;
  marker.title = character.name;
  marker.textContent = text.slice(character.from, character.to);
  return marker;
}

function markTextNode(node: Text): void {
  const text = node.data;
  const characters = listHiddenCharacters(text).filter((character) => !character.isInSequence);
  if (characters.length === 0) return;
  const pieces: Node[] = [];
  let offset = 0;
  for (const character of characters) {
    if (character.from > offset)
      pieces.push(node.ownerDocument.createTextNode(text.slice(offset, character.from)));
    pieces.push(markerFor(node.ownerDocument, character, text));
    offset = character.to;
  }
  if (offset < text.length) pieces.push(node.ownerDocument.createTextNode(text.slice(offset)));
  node.replaceWith(...pieces);
}

/**
 * Draws each hidden character of the rendered or source view as a labelled marker. Markers are built
 * with text content only, never from document markup, and characters inside an emoji or a joined
 * word are left as they are so they keep drawing.
 */
export function showHiddenCharacterMarkers(root: HTMLElement): void {
  for (const node of textNodesToMark(root)) markTextNode(node);
}

/** Puts the characters back as plain text, as before the markers were shown. */
export function removeHiddenCharacterMarkers(root: HTMLElement): void {
  for (const marker of root.querySelectorAll(MARKER_SELECTOR)) marker.replaceWith(...marker.childNodes);
  root.normalize();
}

/**
 * Shows markers and keeps them while highlighting or typesetting replaces text nodes, until the
 * returned clean-up puts the plain characters back.
 */
export function keepHiddenCharactersMarked(root: HTMLElement): () => void {
  showHiddenCharacterMarkers(root);
  const observer = new MutationObserver(() => showHiddenCharacterMarkers(root));
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    removeHiddenCharacterMarkers(root);
  };
}
