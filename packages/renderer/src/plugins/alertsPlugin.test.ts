import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { alertsPlugin } from './alertsPlugin';

const markdown = new MarkdownIt().use(alertsPlugin);

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

  it('leaves ordinary quotes and unknown markers alone', () => {
    expect(markdown.render('> Just a quote')).toBe('<blockquote>\n<p>Just a quote</p>\n</blockquote>\n');
    expect(markdown.render('> [!DANGER]\n> Text')).toContain('<blockquote>');
    expect(markdown.render('> [!NOTE] with text on the same line')).toContain('<blockquote>');
  });

  it('closes the alert at its own end when quotes are nested', () => {
    const html = markdown.render('> [!NOTE]\n> Outer\n> > Inner quote\n\nAfter');

    expect(html).toContain('<blockquote>\n<p>Inner quote</p>\n</blockquote>\n</div>\n<p>After</p>');
  });
});
