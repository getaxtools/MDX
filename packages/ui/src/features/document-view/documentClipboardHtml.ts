/** The selected part of the rendered document, or all of it, as HTML without the app's own markup. */
export function documentClipboardHtml(article: HTMLElement, selection: Selection | null): string {
  const container = article.ownerDocument.createElement('div');
  const selectedRanges = rangesInside(article, selection);
  if (selectedRanges.length === 0) container.append(...[...article.childNodes].map(cloneDeep));
  for (const range of selectedRanges) container.append(range.cloneContents());
  removeAppMarkup(container);
  return container.innerHTML.trim();
}

/**
 * The whole rendered document as HTML for a file of its own. Math keeps only its MathML, which
 * browsers draw by themselves; KaTeX's drawn copy needs KaTeX's styles and fonts.
 */
export function documentExportHtml(article: HTMLElement): string {
  const container = article.ownerDocument.createElement('div');
  container.append(...[...article.childNodes].map(cloneDeep));
  for (const drawnMath of container.querySelectorAll('.katex-html')) drawnMath.remove();
  removeAppMarkup(container);
  return container.innerHTML.trim();
}

/** The text of the rendered document as a reader sees it, without markup. */
export function documentPlainText(article: HTMLElement): string {
  // jsdom, used by the tests, has no innerText.
  const laidOutText = article.innerText as string | undefined;
  return (laidOutText ?? article.textContent).trim();
}

function rangesInside(article: HTMLElement, selection: Selection | null): Range[] {
  if (!selection || selection.isCollapsed) return [];
  return Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)).filter(
    (range) => article.contains(range.commonAncestorContainer),
  );
}

function cloneDeep(node: Node): Node {
  return node.cloneNode(true);
}

const APP_CONTROLS_SELECTOR = 'button, .copy-code';

function removeAppMarkup(container: HTMLElement): void {
  for (const control of container.querySelectorAll(APP_CONTROLS_SELECTOR)) control.remove();
  for (const comment of commentsIn(container)) comment.remove();
  for (const element of container.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('data-')) element.removeAttribute(attribute.name);
    }
  }
}

function commentsIn(container: HTMLElement): Comment[] {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) comments.push(node as Comment);
  return comments;
}
