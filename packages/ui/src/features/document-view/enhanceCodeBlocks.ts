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

/** Adds a copy button to every code block, then highlights the blocks one at a time. */
export async function enhanceCodeBlocks(article: HTMLElement, options: CodeBlockOptions): Promise<void> {
  const codeBlocks = [...article.querySelectorAll<HTMLElement>('pre > code')];
  for (const code of codeBlocks) addCopyButton(code, options);
  for (const code of codeBlocks) {
    if (!options.isStillShown()) return;
    await highlightCodeBlock(code, options);
  }
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
    void writeClipboard(code.textContent).then(() => showCopied(button, translator));
  });
  pre.append(button);
}

function showCopied(button: HTMLButtonElement, translator: Translator): void {
  button.textContent = translator.translate('document.codeCopied');
  setTimeout(() => (button.textContent = translator.translate('document.copyCode')), COPY_FEEDBACK_MS);
}

async function highlightCodeBlock(code: HTMLElement, options: CodeBlockOptions): Promise<void> {
  const language = LANGUAGE_CLASS.exec(code.className)?.[1];
  if (!language || !options.highlighter) return;
  const lines = await options.highlighter.highlight(code.textContent, language);
  if (!lines || !options.isStillShown()) return;
  code.replaceChildren(...renderLines(code.ownerDocument, lines));
  code.classList.add('highlighted');
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
