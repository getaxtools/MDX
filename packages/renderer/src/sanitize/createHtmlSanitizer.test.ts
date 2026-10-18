import { Window as HappyDomWindow } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import {
  createHtmlSanitizer,
  UnsafeSanitizerEnvironmentError,
  type BrowserWindow,
} from './createHtmlSanitizer';

describe('createHtmlSanitizer', () => {
  it('removes scripts and event handlers', () => {
    const sanitize = createHtmlSanitizer(window);

    expect(sanitize('<p onclick="x()">hi</p><script>x()</script>')).toBe('<p>hi</p>');
  });

  it('refuses to work in a DOM environment that lets dangerous markup through', () => {
    expect(() => createHtmlSanitizer(new HappyDomWindow() as unknown as BrowserWindow)).toThrow(
      UnsafeSanitizerEnvironmentError,
    );
  });

  it('keeps prefixed ids and removes other ids and all names', () => {
    const sanitize = createHtmlSanitizer(window);

    expect(sanitize('<h2 id="mdx-usage">Usage</h2><p id="intro">a</p><img name="forms" alt="b">')).toBe(
      '<h2 id="mdx-usage">Usage</h2><p>a</p><img alt="b">',
    );
  });

  it('leaves anchors without href and images without src untouched', () => {
    const sanitize = createHtmlSanitizer(window);

    expect(sanitize('<a>plain</a><img alt="placeholder">')).toBe('<a>plain</a><img alt="placeholder">');
  });

  it('removes links with schemes it does not recognize', () => {
    const sanitize = createHtmlSanitizer(window);

    expect(sanitize('<a href="ftp://example.com/a.md">a</a>')).toBe('<a>a</a>');
  });

  it('drops relative images that point at a scheme', () => {
    const sanitize = createHtmlSanitizer(window, () => 'asset://resolved');

    expect(sanitize('<img src="cid:image001" alt="a">')).toBe('<img alt="a">');
  });
});
