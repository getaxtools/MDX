import { vi } from 'vitest';

/**
 * Fills what jsdom lacks and the visual formula editor uses in the webview: a size observer, media
 * queries, scrolling into view and the document's font set. Without media queries its on-screen keyboard is never
 * created. Call it before the editor's module is imported; the returned function removes it.
 */
export function stubWhatMathfieldsNeed(): () => void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  for (const method of ['scroll', 'scrollIntoView']) {
    Object.defineProperty(Element.prototype, method, { configurable: true, value: vi.fn() });
  }
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve(), add: () => undefined, [Symbol.iterator]: () => [][Symbol.iterator]() },
  });
  return () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'fonts');
    Reflect.deleteProperty(Element.prototype, 'scroll');
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  };
}
