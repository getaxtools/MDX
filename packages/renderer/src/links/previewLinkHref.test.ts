import { describe, expect, it } from 'vitest';
import { previewLinkHref } from './previewLinkHref';

describe('previewLinkHref', () => {
  it('percent-encodes quotes and spaces of a destination in angle brackets', () => {
    expect(previewLinkHref({ destination: '<https://a.com/" -new-window "C:/x>', form: 'destination' })).toBe(
      'https://a.com/%22%20-new-window%20%22C:/x',
    );
  });

  it('decodes entities and escapes before encoding', () => {
    expect(previewLinkHref({ destination: 'caf&eacute;\\_notes.md', form: 'destination' })).toBe(
      'caf%C3%A9_notes.md',
    );
    expect(previewLinkHref({ destination: 'a.md?x=1&amp;y=2', form: 'destination' })).toBe('a.md?x=1&y=2');
  });

  it('writes an international host in punycode', () => {
    expect(previewLinkHref({ destination: 'https://аpple.com/login', form: 'destination' })).toBe(
      'https://xn--pple-43d.com/login',
    );
  });

  it('completes a mail autolink and links an address with a scheme in text', () => {
    expect(previewLinkHref({ destination: 'someone@example.com', form: 'autolink' })).toBe(
      'mailto:someone@example.com',
    );
    expect(previewLinkHref({ destination: 'https://example.com/a', form: 'text' })).toBe(
      'https://example.com/a',
    );
  });

  it('gives nothing for an address the preview does not link', () => {
    expect(previewLinkHref({ destination: 'javascript:alert(1)', form: 'destination' })).toBeUndefined();
    expect(previewLinkHref({ destination: 'just words', form: 'text' })).toBeUndefined();
  });
});
