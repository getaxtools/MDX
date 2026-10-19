import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NoticeBar from './NoticeBar.svelte';

describe('NoticeBar', () => {
  it('announces the message politely and dismisses it', async () => {
    const onDismiss = vi.fn();
    render(NoticeBar, { message: 'File not found', translator: createTranslator(), onDismiss });

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('status').textContent).toContain('File not found');
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('offers the notice actions as buttons', async () => {
    const onAction = vi.fn();
    const locate = { label: 'Locate…', command: { kind: 'locateRecentFile', canonicalKey: 'a.md' } } as const;
    render(NoticeBar, {
      message: 'File not found',
      actions: [locate],
      translator: createTranslator(),
      onAction,
      onDismiss: vi.fn(),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Locate…' }));

    expect(onAction).toHaveBeenCalledWith(locate);
  });

  it('keeps an empty live region when there is no message', () => {
    render(NoticeBar, { message: undefined, translator: createTranslator(), onDismiss: vi.fn() });

    expect(screen.getByRole('status').textContent.trim()).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
