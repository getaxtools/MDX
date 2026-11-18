import { describe, expect, it } from 'vitest';
import { RenderCache } from './renderCache';
import { sharedCacheKey } from './renderedWidgets';
import type { RichTextRendering } from './richTextRendering';

const PROTECTED_KEY = 'protected:c:\\notes|aaaa';

describe('RenderCache', () => {
  it('forgets every render of one document and keeps the others', () => {
    const cache = new RenderCache();
    cache.set(`table:${PROTECTED_KEY}:| PIN | 4821 |`, '<table>4821</table>');
    cache.set(`image:${PROTECTED_KEY}:![card](card.png)`, '<img alt="card">');
    cache.set('table:c:\\docs\\guide.md:| a |', '<table>a</table>');

    cache.forgetDocument(PROTECTED_KEY);

    expect(cache.holdsText('4821')).toBe(false);
    expect(cache.holdsText('card')).toBe(false);
    expect(cache.size).toBe(1);
  });

  it('leaves the renders of a document whose key only starts the same', () => {
    const cache = new RenderCache();
    cache.set(`html:${PROTECTED_KEY}b:<b>x</b>`, '<b>x</b>');

    cache.forgetDocument(PROTECTED_KEY);

    expect(cache.size).toBe(1);
  });
});

describe('sharedCacheKey', () => {
  const rendering = (keepsRendersPrivate: boolean) =>
    ({ documentKey: PROTECTED_KEY, keepsRendersPrivate }) as unknown as RichTextRendering;

  it('shares no render of a protected note, not even a formula or a diagram without its document key', () => {
    expect(sharedCacheKey(rendering(true), 'formula:true:4821')).toBeUndefined();
    expect(sharedCacheKey(rendering(true), 'diagram:mermaid:graph TD; PIN-->4821')).toBeUndefined();
  });

  it('shares the renders of other documents', () => {
    expect(sharedCacheKey(rendering(false), 'formula:true:x^2')).toBe('formula:true:x^2');
  });
});
