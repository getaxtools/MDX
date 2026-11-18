import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { alertsPlugin, calloutLookOf } from './alertsPlugin';

const markdown = new MarkdownIt().use(alertsPlugin);
const MANY_CALLOUTS = 20_000;
/** Far above what editing the tokens in one pass takes, far below what inserting once per callout took. */
const MANY_CALLOUTS_BUDGET_MS = 5_000;

describe('alertsPlugin', () => {
  it.each(['note', 'tip', 'important', 'warning', 'caution'])('turns a [!%s] quote into an alert', (kind) => {
    const html = markdown.render(`> [!${kind.toUpperCase()}]\n> Text`);

    expect(html).toContain(`<div class="markdown-alert markdown-alert-${kind}">`);
  });

  it('accepts the marker in any case and keeps later paragraphs', () => {
    const html = markdown.render('> [!tip]\n> First\n>\n> Second');

    expect(html).toBe(
      '<div class="markdown-alert markdown-alert-tip">\n<p class="markdown-alert-title">Tip</p>\n' +
        '<p>First</p>\n<p>Second</p>\n</div>\n',
    );
  });

  it('drops the paragraph that held only the marker', () => {
    const html = markdown.render('> [!NOTE]\n>\n> Body');

    expect(html).toBe(
      '<div class="markdown-alert markdown-alert-note">\n<p class="markdown-alert-title">Note</p>\n<p>Body</p>\n</div>\n',
    );
  });

  it.each([
    ['info', 'note', 'Info'],
    ['todo', 'note', 'To do'],
    ['abstract', 'note', 'Abstract'],
    ['summary', 'note', 'Summary'],
    ['quote', 'note', 'Quote'],
    ['success', 'tip', 'Success'],
    ['example', 'important', 'Example'],
    ['question', 'warning', 'Question'],
    ['failure', 'caution', 'Failure'],
    ['danger', 'caution', 'Danger'],
    ['bug', 'caution', 'Bug'],
  ])('shows a [!%s] callout with the %s look and its own title', (type, look, title) => {
    const html = markdown.render(`> [!${type}]\n> Text`);

    expect(html).toContain(`<div class="markdown-alert markdown-alert-${look}">`);
    expect(html).toContain(`<p class="markdown-alert-title">${title}</p>`);
  });

  it('unknown type uses note look and its own title', () => {
    const html = markdown.render('> [!recipe]\n> Flour');

    expect(html).toContain('<div class="markdown-alert markdown-alert-note">');
    expect(html).toContain('<p class="markdown-alert-title">Recipe</p>');
  });

  it('a title after the marker replaces the type name', () => {
    expect(markdown.render('> [!TIP] Shortcut\n> Text')).toContain(
      '<p class="markdown-alert-title">Shortcut</p>',
    );
  });

  it('minus starts collapsed', () => {
    const html = markdown.render('> [!faq]- Can I export?\n> Yes.');

    expect(html).toBe(
      '<details class="markdown-alert markdown-alert-note">\n' +
        '<summary class="markdown-alert-title">Can I export?</summary>\n<p>Yes.</p>\n</details>\n',
    );
  });

  it('plus starts expanded', () => {
    expect(markdown.render('> [!NOTE]+\n> Body')).toContain(
      '<details class="markdown-alert markdown-alert-note" open="">',
    );
  });

  it('leaves ordinary quotes and quotes without a marker alone', () => {
    expect(markdown.render('> Just a quote')).toBe('<blockquote>\n<p>Just a quote</p>\n</blockquote>\n');
    expect(markdown.render('> [link](x) [!NOTE]')).toContain('<blockquote>');
  });

  it('closes the alert at its own end when quotes are nested', () => {
    const html = markdown.render('> [!NOTE]\n> Outer\n> > Inner quote\n\nAfter');

    expect(html).toContain('<blockquote>\n<p>Inner quote</p>\n</blockquote>\n</div>\n<p>After</p>');
  });

  it('gives the look of each known callout type and none for an unknown one', () => {
    expect(calloutLookOf('TIP')).toBe('tip');
    expect(calloutLookOf('danger')).toBe('caution');
    expect(calloutLookOf('mystery')).toBeUndefined();
  });

  it('turns thousands of quotes into callouts quickly', () => {
    const callouts = Array.from(
      { length: MANY_CALLOUTS },
      (_, index) => `> [!NOTE]\n> Callout ${String(index)}.`,
    );
    const startedAt = performance.now();

    const tokens = markdown.parse(callouts.join('\n\n'), {});

    expect(performance.now() - startedAt).toBeLessThan(MANY_CALLOUTS_BUDGET_MS);
    expect(tokens.filter((token) => token.attrGet('class') === 'markdown-alert-title')).toHaveLength(
      MANY_CALLOUTS,
    );
  });
});
