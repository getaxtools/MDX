import { createTranslator, loadMessages } from '@mdx/i18n';
import { describe, expect, it } from 'vitest';
import { showBlockedRemoteImages } from './showBlockedRemoteImages';

const BLOCKED_POSTER = '<img alt="Poster" data-mdx-blocked-src="https://example.com/poster.jpg">';

function articleWith(html: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = html;
  return article;
}

describe('showBlockedRemoteImages', () => {
  it('says which remote image was not loaded, next to its description', () => {
    const article = articleWith(`<p>${BLOCKED_POSTER}</p>`);

    showBlockedRemoteImages(article, createTranslator());

    const note = article.querySelector('img + .blocked-remote-image');
    expect(note?.querySelector('.blocked-remote-image-alt')?.textContent).toBe('Poster');
    expect(note?.querySelector('.blocked-remote-image-reason')?.textContent).toBe(
      'Remote image not loaded: https://example.com/poster.jpg',
    );
  });

  it('gives only the reason when the image has no description', () => {
    const article = articleWith('<img data-mdx-blocked-src="https://example.com/pixel.png">');

    showBlockedRemoteImages(article, createTranslator());

    expect(article.querySelector('.blocked-remote-image')?.textContent).toBe(
      'Remote image not loaded: https://example.com/pixel.png',
    );
  });

  it('leaves local images alone', () => {
    const article = articleWith('<img alt="Logo" src="http://mdx-image.localhost/logo.png">');

    showBlockedRemoteImages(article, createTranslator());

    expect(article.querySelector('.blocked-remote-image')).toBeNull();
  });

  it('keeps one note per image when shown again in another language', async () => {
    const article = articleWith(BLOCKED_POSTER);
    showBlockedRemoteImages(article, createTranslator());
    const german = createTranslator({ locale: 'de', messages: await loadMessages('de') });

    showBlockedRemoteImages(article, german);

    const notes = article.querySelectorAll('.blocked-remote-image-reason');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe('Externes Bild nicht geladen: https://example.com/poster.jpg');
  });
});
