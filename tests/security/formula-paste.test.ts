import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { measureTextAsEmpty, pasteInto } from '../../packages/editor/src/formula-paste/pasteTestEvents';
import { openRichTextEditor, type TestEditor } from '../../packages/editor/src/rich-text/richTextTestEditor';

const HOSTILE_HTML = [
  '<script>globalThis.wasPastedScriptRun = true</script>',
  '<img src="https://example.com/pixel.png" onerror="globalThis.wasPastedHandlerRun = true">',
  '<iframe src="https://example.com/frame" onload="globalThis.wasPastedHandlerRun = true"></iframe>',
  '<link rel="stylesheet" href="https://example.com/style.css">',
  '<object data="https://example.com/object"></object>',
  '<svg><script>globalThis.wasPastedScriptRun = true</script><image href="https://example.com/svg.png"/></svg>',
  '<p onclick="globalThis.wasPastedHandlerRun = true">Formula ',
  '<math alttext="x"><annotation encoding="application/x-tex">x^2</annotation></math>',
  '<img src="https://example.com/fallback.png" alt="x^2"></p>',
].join('');

declare global {
  var wasPastedScriptRun: boolean | undefined;
  var wasPastedHandlerRun: boolean | undefined;
}

let opened: TestEditor | undefined;
let restoreTextMeasuring: () => void;

beforeAll(() => {
  restoreTextMeasuring = measureTextAsEmpty();
});

afterAll(() => {
  restoreTextMeasuring();
});

afterEach(() => {
  opened?.close();
  opened = undefined;
  vi.restoreAllMocks();
});

describe('formula paste security', () => {
  it('pasted HTML runs no script and loads nothing', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    opened = openRichTextEditor('');

    pasteInto(opened.view, { 'text/plain': 'Formula x2', 'text/html': HOSTILE_HTML });
    await vi.waitFor(() => expect(opened?.view.state.doc.toString()).toBe('Formula $x^2$'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(globalThis.wasPastedScriptRun).toBeUndefined();
    expect(globalThis.wasPastedHandlerRun).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(document.querySelectorAll('iframe, object, link, script').length).toBe(0);
  });
});
