import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanHtml } from './scanHtml';

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea']);

function scan(text: string) {
  return scanHtml(text, { from: 0, to: text.length }, RAW_TEXT_ELEMENTS);
}

describe('scanHtml', () => {
  it('reads opening and closing tags with lower-case names and their ranges', () => {
    expect(scan('<DIV>text</Div>')).toEqual([
      { kind: 'openTag', name: 'div', attributes: new Map(), from: 0, to: 5, isSelfClosing: false },
      { kind: 'closeTag', name: 'div', from: 9, to: 15 },
    ]);
  });

  it('reads quoted, unquoted and empty attributes, decoding character references', () => {
    const [tag] = scan(`<a HREF="java&#115;cript:x" title='Tip' data-x=1 hidden>`);

    expect(tag?.kind === 'openTag' && Object.fromEntries(tag.attributes)).toEqual({
      href: 'javascript:x',
      title: 'Tip',
      'data-x': '1',
      hidden: '',
    });
  });

  it('reads self-closing tags', () => {
    expect(scan('<img src="a.png"/>')).toMatchObject([{ kind: 'openTag', name: 'img', isSelfClosing: true }]);
  });

  it('reads comments with their content, closed or not', () => {
    expect(scan('a<!-- note -->b<!-- open')).toEqual([
      { kind: 'comment', from: 1, to: 14, content: ' note ' },
      { kind: 'comment', from: 15, to: 24, content: ' open' },
    ]);
  });

  it('does not read tags inside raw text elements such as script', () => {
    const items = scan('<script>if (a < b) "<div hidden>"</script><b>');

    expect(items.map((item) => (item.kind === 'comment' ? 'comment' : `${item.kind}:${item.name}`))).toEqual([
      'openTag:script',
      'closeTag:script',
      'openTag:b',
    ]);
  });

  it('skips doctypes, processing instructions and lone angle brackets', () => {
    expect(scan('<!DOCTYPE html><?xml x?>a < b <> <1>')).toEqual([]);
  });

  it('stays inside the range it is given', () => {
    const text = '<b>one</b><i>two</i>';

    expect(scanHtml(text, { from: 10, to: text.length }, RAW_TEXT_ELEMENTS).map((item) => item.from)).toEqual(
      [10, 16],
    );
  });

  it('never throws on malformed HTML and keeps every item inside the text', () => {
    const htmlish = fc.string({
      unit: fc.constantFrom('<', '>', '/', '!', '-', '=', '"', "'", ' ', 'a', 'b', 'script'),
    });

    fc.assert(
      fc.property(htmlish, (text) => {
        const items = scan(text);

        for (const item of items) {
          expect(item.from).toBeGreaterThanOrEqual(0);
          expect(item.to).toBeLessThanOrEqual(text.length);
          expect(item.to).toBeGreaterThan(item.from);
        }
      }),
    );
  });
});
