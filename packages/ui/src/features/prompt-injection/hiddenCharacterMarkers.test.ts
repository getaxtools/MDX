import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  documentClipboardHtml,
  documentExportHtml,
  documentPlainText,
} from '../document-view/documentClipboardHtml';
import {
  keepHiddenCharactersMarked,
  removeHiddenCharacterMarkers,
  showHiddenCharacterMarkers,
} from './hiddenCharacterMarkers';

const ZERO_WIDTH_SPACE = '\u200B';
const FAMILY_EMOJI = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';

function articleWith(html: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = html;
  document.body.append(article);
  return article;
}

function textParagraph(text: string): HTMLElement {
  const article = articleWith('<p></p>');
  article.querySelector('p')?.append(text);
  return article;
}

describe('hidden character markers in the rendered and source views', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('draws a hidden character as a labelled marker that keeps the character as its text', () => {
    const article = textParagraph(`ign${ZERO_WIDTH_SPACE}ore`);

    showHiddenCharacterMarkers(article);
    const marker = article.querySelector('.mdx-hidden-character');

    expect(marker?.getAttribute('aria-label')).toBe('zero width space');
    expect(marker?.getAttribute('data-label')).toBe('ZWSP');
    expect(marker?.textContent).toBe(ZERO_WIDTH_SPACE);
    expect(article.textContent).toBe(`ign${ZERO_WIDTH_SPACE}ore`);
  });

  it('creates no markup from the document text around a marker', () => {
    const article = textParagraph(`<img src=x onerror=alert(1)>${ZERO_WIDTH_SPACE}<b>bold</b>`);

    showHiddenCharacterMarkers(article);

    expect(article.querySelector('img, b')).toBeNull();
    expect(article.querySelectorAll('.mdx-hidden-character')).toHaveLength(1);
  });

  it('leaves emoji families, math and the app controls unmarked', () => {
    const article = articleWith(
      `<p>Family ${FAMILY_EMOJI}</p><span class="mdx-math-inline">a${ZERO_WIDTH_SPACE}b</span><button>x${ZERO_WIDTH_SPACE}</button>`,
    );

    showHiddenCharacterMarkers(article);

    expect(article.querySelector('.mdx-hidden-character')).toBeNull();
  });

  it('keeps markers out of copied text, copied HTML and exported files', () => {
    const article = textParagraph(`ign${ZERO_WIDTH_SPACE}ore`);
    showHiddenCharacterMarkers(article);

    expect(documentPlainText(article)).toBe(`ign${ZERO_WIDTH_SPACE}ore`);
    expect(documentClipboardHtml(article, null)).toBe(`<p>ign${ZERO_WIDTH_SPACE}ore</p>`);
    expect(documentExportHtml(article)).toBe(`<p>ign${ZERO_WIDTH_SPACE}ore</p>`);
    expect(article.querySelector('.mdx-hidden-character')).not.toBeNull();
  });

  it('draws no marker labels on printed pages', () => {
    const printStyles = readFileSync(join(import.meta.dirname, '..', '..', 'tokens', 'print.css'), 'utf8');

    expect(printStyles).toMatch(/\.mdx-hidden-character::before\s*{\s*content: none !important;/);
  });

  it('puts the plain characters back when markers are hidden', () => {
    const article = textParagraph(`a${ZERO_WIDTH_SPACE}b`);
    showHiddenCharacterMarkers(article);

    removeHiddenCharacterMarkers(article);

    expect(article.innerHTML).toBe(`<p>a${ZERO_WIDTH_SPACE}b</p>`);
  });

  it('marks text again after highlighting replaces it, until it is told to stop', async () => {
    const article = textParagraph('plain');
    const stopMarking = keepHiddenCharactersMarked(article);

    article.querySelector('p')?.replaceChildren(`new${ZERO_WIDTH_SPACE}text`);
    await Promise.resolve();
    const markerCount = article.querySelectorAll('.mdx-hidden-character').length;
    stopMarking();

    expect(markerCount).toBe(1);
    expect(article.querySelector('.mdx-hidden-character')).toBeNull();
  });
});
