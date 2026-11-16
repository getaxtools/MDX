import { describe, expect, it } from 'vitest';
import { Ruleset } from '../Ruleset';
import { decodePunycodeLabel } from './decodePunycode';
import { findUrlData } from './findUrlData';
import { isDeceptiveHost } from './isDeceptiveHost';
import { isHostIn, readRemoteUrl } from './readRemoteUrl';

const LIMITS = {
  maxValueLength: 64,
  minEncodedLength: 24,
  minHexLength: 32,
  minDataValueLength: 8,
  dataParameterNames: ['q', 'data'],
  trackingParameterPrefixes: ['utm_'],
};
const latinLookalikes = Ruleset.bundled().codepointSet('latinLookalikes');

function dataOf(address: string) {
  return findUrlData(new URL(address), LIMITS);
}

describe('readRemoteUrl', () => {
  it('reads web addresses, including protocol-relative ones, and keeps the host as written', () => {
    expect(readRemoteUrl('//Example.invalid/a')?.host).toBe('example.invalid');
    expect(readRemoteUrl('https://user@\u0430pple.example/x')).toMatchObject({
      host: 'xn--pple-43d.example',
      writtenHost: '\u0430pple.example',
    });
  });

  it('ignores relative, data and other addresses', () => {
    expect(readRemoteUrl('docs/a.md')).toBeUndefined();
    expect(readRemoteUrl('data:image/png;base64,AAAA')).toBeUndefined();
    expect(readRemoteUrl('mailto:a@example.invalid')).toBeUndefined();
  });

  it('matches hosts and their subdomains against patterns', () => {
    expect(isHostIn('abc.ngrok.app', ['*.ngrok.app'])).toBe(true);
    expect(isHostIn('webhook.site', ['webhook.site'])).toBe(true);
    expect(isHostIn('x.webhook.site', ['webhook.site'])).toBe(true);
    expect(isHostIn('notwebhook.site', ['webhook.site'])).toBe(false);
  });
});

describe('findUrlData', () => {
  it.each([
    ['https://example.invalid/i.png?q={chat_history}', true],
    ['https://example.invalid/i.png?d=$SECRET', true],
    ['https://example.invalid/[DATA].png', true],
    ['https://example.invalid/i.png?x=%3Csecret%3E', true],
    ['https://example.invalid/i.png?s=%s', true],
  ])('finds the placeholder in %s', (address, hasPlaceholder) => {
    expect(dataOf(address)).toEqual({ hasPlaceholder, hasData: true });
  });

  it('finds long, base64-looking, hexadecimal and named data values', () => {
    expect(dataOf(`https://example.invalid/?x=${'a'.repeat(65)}`).hasData).toBe(true);
    expect(dataOf('https://example.invalid/?x=U2VjcmV0IGNoYXQgaGlzdG9yeQ12').hasData).toBe(true);
    expect(dataOf(`https://example.invalid/?x=${'ab12'.repeat(8)}`).hasData).toBe(true);
    expect(dataOf('https://example.invalid/?q=summary+of+chat').hasData).toBe(true);
    expect(dataOf(`https://example.invalid/${'p'.repeat(65)}`).hasData).toBe(true);
  });

  it('skips short values, tracking parameters and normal paths', () => {
    expect(dataOf('https://example.invalid/docs/a.png?v=2&q=png').hasData).toBe(false);
    expect(dataOf(`https://example.invalid/?utm_source=${'x'.repeat(80)}`).hasData).toBe(false);
    expect(dataOf('https://example.invalid/badge/build-passing-green.svg?style=flat').hasData).toBe(false);
  });
});

describe('decodePunycodeLabel', () => {
  it('decodes Punycode labels and rejects others', () => {
    expect(decodePunycodeLabel('xn--pple-43d')).toBe('\u0430pple');
    expect(decodePunycodeLabel('xn--mnchen-3ya')).toBe('münchen');
    expect(decodePunycodeLabel('xn--wgv71a119e')).toBe('日本語');
    expect(decodePunycodeLabel('example')).toBeUndefined();
    expect(decodePunycodeLabel('xn--!!')).toBeUndefined();
  });
});

describe('isDeceptiveHost', () => {
  it('flags a label that mixes Latin and Cyrillic letters, also written in Punycode', () => {
    expect(isDeceptiveHost('\u0430pple.example', latinLookalikes)).toBe(true);
    expect(isDeceptiveHost('xn--pple-43d.example', latinLookalikes)).toBe(true);
  });

  it('flags a whole-script look-alike made only of Cyrillic letters that imitate Latin ones', () => {
    expect(isDeceptiveHost('\u0440\u0430\u0443\u0440\u0430\u0441.example', latinLookalikes)).toBe(true);
  });

  it('does not flag single-script international hosts or normal Japanese mixes', () => {
    expect(isDeceptiveHost('\u043F\u0440\u0438\u043C\u0435\u0440.example', latinLookalikes)).toBe(false);
    expect(isDeceptiveHost('münchen.example', latinLookalikes)).toBe(false);
    expect(isDeceptiveHost('日本語abc.example', latinLookalikes)).toBe(false);
    expect(isDeceptiveHost('مثال.example', latinLookalikes)).toBe(false);
    expect(isDeceptiveHost('docs-2.example.invalid', latinLookalikes)).toBe(false);
  });
});
