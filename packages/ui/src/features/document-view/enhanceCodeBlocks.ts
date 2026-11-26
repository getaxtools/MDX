import type { Translator } from '@mdx/i18n';
import type { CodeHighlighter, HighlightedLine, HighlightedToken } from '@mdx/renderer';

const LANGUAGE_CLASS = /(?:^|\s)language-([\w#+.-]+)/;
export const COPY_FEEDBACK_MS = 1500;

export interface CodeBlockOptions {
  readonly highlighter: CodeHighlighter | undefined;
  readonly translator: Translator;
  readonly isStillShown: () => boolean;
  readonly writeClipboard: (text: string) => Promise<void>;
}

/**
 * How long highlighted code gathers before it is put in place with the next block that finishes. Each
 * change to the page lays out the whole document again, so a long document with thousands of code
 * blocks is changed once per batch.
 */
export const HIGHLIGHT_BATCH_MS = 50;

interface HighlightedCodeBlock {
  readonly code: HTMLElement;
  readonly lines: readonly HighlightedLine[];
}

/** Adds a copy button to every code block, then highlights the blocks and puts them in place in batches. */
export async function enhanceCodeBlocks(article: HTMLElement, options: CodeBlockOptions): Promise<void> {
  const codeBlocks = [...article.querySelectorAll<HTMLElement>('pre > code')];
  for (const code of codeBlocks) addCopyButton(code, options);
  let batch: HighlightedCodeBlock[] = [];
  let batchStartedAt = 0;
  for (const code of codeBlocks) {
    if (!options.isStillShown()) return;
    const highlighted = await highlightCodeBlock(code, options);
    if (!highlighted) continue;
    // Timed from its first block, so the layout the last batch caused does not count against this one.
    if (batch.length === 0) batchStartedAt = performance.now();
    batch.push(highlighted);
    if (performance.now() - batchStartedAt >= HIGHLIGHT_BATCH_MS) {
      showHighlightedCode(batch, options);
      batch = [];
    }
  }
  showHighlightedCode(batch, options);
}

function addCopyButton(code: HTMLElement, { translator, writeClipboard }: CodeBlockOptions): void {
  const pre = code.parentElement;
  if (!pre || pre.querySelector(':scope > .copy-code')) return;
  const button = pre.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'copy-code';
  button.textContent = translator.translate('document.copyCode');
  button.setAttribute('aria-label', translator.translate('document.copyCodeLabel'));
  button.addEventListener('click', () => {
    void writeClipboard(code.textContent).then(
      () => showCopyFeedback(button, translator.translate('document.codeCopied'), translator),
      () => showCopyFeedback(button, translator.translate('document.codeNotCopied'), translator),
    );
  });
  pre.append(button);
}

function showCopyFeedback(button: HTMLButtonElement, feedback: string, translator: Translator): void {
  button.textContent = feedback;
  setTimeout(() => (button.textContent = translator.translate('document.copyCode')), COPY_FEEDBACK_MS);
}

async function highlightCodeBlock(
  code: HTMLElement,
  options: CodeBlockOptions,
): Promise<HighlightedCodeBlock | undefined> {
  const language = LANGUAGE_CLASS.exec(code.className)?.[1];
  if (!language || !options.highlighter) return undefined;
  const lines = await options.highlighter.highlight(code.textContent, language);
  return lines ? { code, lines } : undefined;
}

function showHighlightedCode(batch: readonly HighlightedCodeBlock[], options: CodeBlockOptions): void {
  if (!options.isStillShown()) return;
  for (const { code, lines } of batch) {
    code.replaceChildren(...renderLines(code.ownerDocument, lines));
    code.classList.add('highlighted');
  }
}

function renderLines(document: Document, lines: readonly HighlightedLine[]): Node[] {
  return lines.flatMap((line, index) => [
    ...(index === 0 ? [] : [document.createTextNode('\n')]),
    ...line.map((token) => renderToken(document, token)),
  ]);
}

function renderToken(document: Document, token: HighlightedToken): Node {
  if (!token.lightColor && !token.darkColor && !token.isItalic && !token.isBold) {
    return document.createTextNode(token.text);
  }
  const span = document.createElement('span');
  span.textContent = token.text;
  if (token.lightColor) span.style.setProperty('--code-light', token.lightColor);
  if (token.darkColor) span.style.setProperty('--code-dark', token.darkColor);
  if (token.isItalic) span.style.fontStyle = 'italic';
  if (token.isBold) span.style.fontWeight = 'bold';
  return span;
}
