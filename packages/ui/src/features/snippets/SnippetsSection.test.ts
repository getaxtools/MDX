import { EMPTY_SNIPPET_LIBRARY, type SnippetLibrary } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SnippetsSection from './SnippetsSection.svelte';

function renderSection(library: SnippetLibrary = EMPTY_SNIPPET_LIBRARY) {
  const onCommand = vi.fn();
  render(SnippetsSection, { library, translator: createTranslator(), onCommand });
  return { onCommand, section: screen.getByRole('region', { name: 'Snippets' }) };
}

describe('SnippetsSection', () => {
  it('create a snippet', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderSection();

    await user.click(screen.getByRole('button', { name: 'New Snippet' }));
    const form = within(screen.getByRole('form', { name: 'Snippet' }));
    await user.type(form.getByRole('textbox', { name: 'Name' }), 'Sign-off');
    await user.type(form.getByRole('textbox', { name: 'Text' }), 'Best wishes');
    await user.click(form.getByRole('button', { name: 'Save Snippet' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'saveSnippet',
      snippet: expect.objectContaining({ name: 'Sign-off', body: 'Best wishes' }) as unknown,
    });
  });

  it('edit a snippet and refuse a name another snippet has', async () => {
    const user = userEvent.setup();
    const library = {
      snippets: [{ id: 'user.1', name: 'Sign-off', trigger: 'sig', body: 'Best' }],
      hiddenBuiltInIds: [],
    };
    const { onCommand } = renderSection(library);

    await user.click(screen.getByRole('button', { name: 'Edit Sign-off' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'date');
    await user.click(screen.getByRole('button', { name: 'Save Snippet' }));

    expect(screen.getByRole('alert').textContent.trim()).toBe('Another snippet already has this name.');
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('built-ins can be hidden, not deleted', async () => {
    const user = userEvent.setup();
    const { onCommand, section } = renderSection();
    const frontMatter = within(section).getByText('Front matter').closest('li');
    if (!frontMatter) throw new Error('no Front matter row');

    await user.click(within(frontMatter).getByRole('button', { name: 'Hide' }));

    expect(within(frontMatter).queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setBuiltInSnippetHidden',
      snippetId: 'builtIn.frontMatter',
      isHidden: true,
    });
  });
});
