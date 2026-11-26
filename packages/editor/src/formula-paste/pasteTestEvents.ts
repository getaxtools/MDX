import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EditorView } from '@codemirror/view';

/** A paste whose clipboard holds the given types and files, as the browser fires it; true when it was handled. */
export function pasteInto(
  view: EditorView,
  data: Readonly<Record<string, string>>,
  files: readonly File[] = [],
): boolean {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => data[type] ?? '', files, types: Object.keys(data) },
  });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

const CLIPBOARD_FIXTURES = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'clipboard',
);

export interface ClipboardSample {
  readonly name: string;
  readonly text: string;
  readonly html: string;
  readonly expectedMarkdown: string;
}

function fixtureText(fileName: string): string {
  try {
    return readFileSync(join(CLIPBOARD_FIXTURES, fileName), 'utf8').replace(/\n$/, '');
  } catch {
    return '';
  }
}

/** The clipboard corpus: each sample's plain text, HTML and the Markdown its paste gives. */
export function clipboardSamples(): ClipboardSample[] {
  return readdirSync(CLIPBOARD_FIXTURES)
    .filter((fileName) => fileName.endsWith('.expected.md'))
    .map((fileName) => fileName.replace('.expected.md', ''))
    .map((name) => ({
      name,
      text: fixtureText(`${name}.txt`),
      html: fixtureText(`${name}.html`),
      expectedMarkdown: fixtureText(`${name}.expected.md`),
    }));
}

/**
 * CodeMirror measures text to place tooltips and scroll the caret into view, which jsdom does not
 * lay out; this gives empty measurements and returns how to put the originals back.
 */
export function measureTextAsEmpty(): () => void {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 0, 0),
  });
  return () => {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  };
}
