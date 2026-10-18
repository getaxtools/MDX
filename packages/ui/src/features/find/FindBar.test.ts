import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FindBar from './FindBar.svelte';

function renderFindBar(html: string) {
  const article = document.createElement('article');
  article.innerHTML = html;
  document.body.append(article);
  const onClose = vi.fn();
  render(FindBar, {
    searchRoot: article,
    contentKey: html,
    focusRequest: 1,
    translator: createTranslator(),
    onClose,
  });
  return { onClose };
}

describe('FindBar', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('focuses the search box when opened', () => {
    renderFindBar('<p>text</p>');

    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Find' }));
  });

  it('counts the matches and steps through them with Enter and Shift+Enter', async () => {
    renderFindBar('<p>alpha beta alpha gamma alpha</p>');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find' }), 'alpha');
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
    await userEvent.keyboard('{Enter}{Enter}');
    expect(screen.getByRole('status').textContent).toBe('3 of 3');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status').textContent).toBe('1 of 3');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');

    expect(screen.getByRole('status').textContent).toBe('3 of 3');
  });

  it('moves to the next match with F3', async () => {
    renderFindBar('<p>one two one</p>');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find' }), 'one');

    await userEvent.keyboard('{F3}');

    expect(screen.getByRole('status').textContent).toBe('2 of 2');
  });

  it('says when nothing matches and disables the step buttons', async () => {
    renderFindBar('<p>text</p>');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find' }), 'missing');

    expect(screen.getByRole('status').textContent).toBe('No matches');
    expect(screen.getByRole('button', { name: 'Next match' }).hasAttribute('disabled')).toBe(true);
  });

  it('closes with Escape', async () => {
    const { onClose } = renderFindBar('<p>text</p>');

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
