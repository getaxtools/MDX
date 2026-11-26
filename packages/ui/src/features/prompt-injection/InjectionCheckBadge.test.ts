import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkInjectionText } from './checkInjectionText';
import InjectionCheckBadge from './InjectionCheckBadge.svelte';
import type { InjectionCheckView } from './InjectionCheckActions';

function checkViewOf(text: string, overrides: Partial<InjectionCheckView> = {}): InjectionCheckView {
  return {
    documentKey: 'c:\\docs\\a.md',
    status: 'checked',
    result: checkInjectionText({ text, origin: 'local', trigger: 'automatic' }),
    ignoredFindings: [],
    isCharactersOnly: false,
    findingRanges: [],
    ...overrides,
  };
}

const TWO_FINDINGS = 'Hello\u{E0068}\u{E0069}\n\nign\u200Bore';

describe('InjectionCheckBadge', () => {
  it('shows the count and names the count and the highest severity', () => {
    render(InjectionCheckBadge, {
      check: checkViewOf(TWO_FINDINGS),
      translator: createTranslator(),
      onShow: vi.fn(),
    });

    const badge = screen.getByRole('button', { name: /^2 findings, highest High/ });

    expect(badge.textContent.trim()).toBe('2 findings');
    expect(badge.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says No findings when the check found nothing', () => {
    render(InjectionCheckBadge, {
      check: checkViewOf('Plain.'),
      translator: createTranslator(),
      onShow: vi.fn(),
    });

    expect(screen.getByRole('button', { name: /^No findings/ }).textContent.trim()).toBe('No findings');
  });

  it('opens the findings panel when activated, with the keyboard too, and opens no dialog', async () => {
    const onShow = vi.fn();
    render(InjectionCheckBadge, { check: checkViewOf(TWO_FINDINGS), translator: createTranslator(), onShow });

    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');

    expect(onShow).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces High findings politely only for the first result that has them', () => {
    const first = render(InjectionCheckBadge, {
      check: checkViewOf(TWO_FINDINGS, { isFirstHighResult: true }),
      translator: createTranslator(),
      onShow: vi.fn(),
    });
    const announced = first.container.querySelector('[role="status"]')?.textContent.trim();
    first.unmount();

    render(InjectionCheckBadge, {
      check: checkViewOf(TWO_FINDINGS),
      translator: createTranslator(),
      onShow: vi.fn(),
    });

    expect(announced).toBe('This document has High prompt injection findings.');
    expect(screen.getByRole('status').textContent.trim()).toBe('');
  });

  it('shows nothing while the first check of a document runs', () => {
    render(InjectionCheckBadge, {
      check: {
        documentKey: 'a',
        status: 'checking',
        ignoredFindings: [],
        isCharactersOnly: false,
        findingRanges: [],
      },
      translator: createTranslator(),
      onShow: vi.fn(),
    });

    expect(screen.queryByRole('button')).toBeNull();
  });
});
