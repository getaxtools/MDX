import { Ruleset } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkInjectionText } from './checkInjectionText';
import type { InjectionCheckView } from './InjectionCheckActions';
import type { ViewerCommand } from '../viewer/viewerCommands';
import PromptInjectionPanel from './PromptInjectionPanel.svelte';

const MIXED_DOCUMENT = [
  'Hello\u{E0068}\u{E0069}',
  'ign\u200Bore',
  '',
  '[unused]: https://example.com/a',
  '',
  '<!-- note -->',
].join('\n');

function checkViewOf(text: string, overrides: Partial<InjectionCheckView> = {}): InjectionCheckView {
  return {
    documentKey: 'c:\\docs\\a.md',
    status: 'checked',
    result: checkInjectionText({ text, origin: 'local', trigger: 'manual' }),
    ignoredFindings: [],
    isCharactersOnly: false,
    ...overrides,
  };
}

function renderPanel(check: InjectionCheckView | undefined, hasDocument = true) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  const view = render(PromptInjectionPanel, {
    hasDocument,
    check,
    translator: createTranslator(),
    onCommand,
  });
  return { onCommand, panel: view.container };
}

describe('PromptInjectionPanel', () => {
  it('says it found nothing it checks for, shows the disclaimer, and never calls the document safe', () => {
    const { panel } = renderPanel(checkViewOf('# Plain\n\nNothing hidden.'));

    expect(screen.getByText('Found nothing we check for.')).toBeTruthy();
    expect(screen.getByText(/finds only the tricks it knows/)).toBeTruthy();
    expect(panel.textContent).not.toMatch(/safe/i);
  });

  it('shows the rules version of the result', () => {
    renderPanel(checkViewOf('Plain.'));

    expect(screen.getByText(`Rules version ${Ruleset.bundled().version}`)).toBeTruthy();
  });

  it('groups findings from High to Low, with Info in a collapsed Hidden content group', () => {
    const { panel } = renderPanel(checkViewOf(MIXED_DOCUMENT));

    const headings = [...panel.querySelectorAll('h3')].map((heading) => heading.textContent.trim());
    const hiddenContent = panel.querySelector('details');

    expect(headings).toEqual(['High (1)', 'Medium (1)', 'Low (1)']);
    expect(hiddenContent?.open).toBe(false);
    expect(hiddenContent?.querySelector('summary')?.textContent.trim()).toBe('Hidden content (1)');
  });

  it('shows a direction override as a marker and markup as plain text, reading left to right', () => {
    const { panel } = renderPanel(checkViewOf('user \u202E<b>admin</b>'));

    const excerpts = [...panel.querySelectorAll('bdi.excerpt')];

    expect(excerpts[0]?.textContent).toContain('⟨RLO⟩<b>admin</b>');
    expect(excerpts.every((excerpt) => excerpt.getAttribute('dir') === 'ltr')).toBe(true);
    expect(panel.querySelector('b')).toBeNull();
  });

  it('shows the hidden text decoded from tag characters', () => {
    renderPanel(checkViewOf('Note\u{E0072}\u{E0065}\u{E0070}\u{E006C}\u{E0079}'));

    expect(screen.getByText('reply')).toBeTruthy();
  });

  it('says when a document was checked as an agent file or only partly checked', () => {
    const result = checkInjectionText({
      text: 'Plain.',
      origin: 'local',
      trigger: 'manual',
      isAgentContext: true,
    });

    renderPanel(checkViewOf('Plain.', { result, isCharactersOnly: true }));

    expect(screen.getByText('Checked as an agent file.')).toBeTruthy();
    expect(
      screen.getByText('This document is very large, so only its characters were checked.'),
    ).toBeTruthy();
  });

  it('asks to ignore one finding or its rule in this document', async () => {
    const { onCommand } = renderPanel(checkViewOf('ign\u200Bore'));

    await userEvent.click(screen.getByRole('button', { name: 'Ignore Zero-width characters on line 1' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Ignore this rule in this document: Zero-width characters' }),
    );

    expect(onCommand.mock.calls).toEqual([
      [expect.objectContaining({ kind: 'ignoreInjectionFinding', scope: 'finding' })],
      [expect.objectContaining({ kind: 'ignoreInjectionFinding', scope: 'ruleInDocument' })],
    ]);
  });

  it('counts ignored findings and shows them on request, with a way to show each again', async () => {
    const shown = checkViewOf('ign\u200Bore');
    const ignored = shown.result?.findings ?? [];
    const check = {
      ...shown,
      result: { ...(shown.result ?? checkViewOf('').result), findings: [], ignoredCount: 1 },
      ignoredFindings: ignored,
    } as InjectionCheckView;
    const { onCommand } = renderPanel(check);

    expect(screen.getByText('1 ignored')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show ignored' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Show again: Zero-width characters on line 1' }),
    );

    expect(screen.getByRole('button', { name: 'Hide ignored' }).getAttribute('aria-expanded')).toBe('true');
    expect(onCommand).toHaveBeenLastCalledWith({ kind: 'showInjectionFindingAgain', finding: ignored[0] });
  });

  it('reaches each finding with Tab, opens it with Enter, and announces its line', async () => {
    const { onCommand } = renderPanel(checkViewOf('first\nign\u200Bore'));
    const region = screen.getByRole('region', { name: 'Prompt injection check' });

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement?.textContent).toContain('Line 2, column 4');
    expect(onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'revealInjectionFinding' }));
    expect(within(region).getByRole('status').textContent).toBe('Line 2');
    expect(region.hasAttribute('data-focus-region')).toBe(true);
  });

  it('offers to check the shown document, and says when there is none', async () => {
    const { onCommand } = renderPanel(undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Check this document' }));

    expect(screen.getByText('This document has not been checked yet.')).toBeTruthy();
    expect(onCommand).toHaveBeenCalledWith({ kind: 'checkForPromptInjection' });
  });

  it('has nothing to check without a document', () => {
    renderPanel(undefined, false);

    expect(screen.getByText('Open a document to check it.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps excerpts left to right in a right-to-left layout', () => {
    const host = document.createElement('div');
    host.dir = 'rtl';
    document.body.append(host);

    render(PromptInjectionPanel, {
      target: host,
      props: {
        hasDocument: true,
        check: checkViewOf('ign\u200Bore'),
        translator: createTranslator(),
        onCommand: vi.fn(),
      },
    });

    expect(host.querySelector('bdi.excerpt')?.getAttribute('dir')).toBe('ltr');
    host.remove();
  });
});
