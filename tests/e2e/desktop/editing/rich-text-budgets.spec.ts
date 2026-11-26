import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { privateWorkingSetMegabytes } from '../../support/appMemory';
import { webviewProcessCount } from '../../support/appNetworkConnections';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

const RESULTS_FOLDER = 'C:/mdx-build/rich-text';
const LARGE_DOCUMENT = 'one-megabyte.md';
/** Just under the 1 MB Rich text limit, so the document opens in Rich text. */
const LARGE_DOCUMENT_BYTES = 1_000_000;
/** The extra idle memory Rich text may take over Source with a 1 MB document. */
const RICH_TEXT_EXTRA_BUDGET_MB = 5;
const COLD_START_BUDGET_MS = 1000;
const WEBVIEW_EXIT_WAIT_MS = 15_000;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const SETTLE_MS = 10_000;
const LARGE_DOCUMENT_OPEN_WAIT_MS = 60_000;
const COLLECTIONS = 3;
const KEYSTROKES = 20;
/** One frame at 60 Hz: Rich text may add no more than this to the editor's work for a key. */
const FRAME_MS = 16;
/**
 * The app's own webview arguments, plus a way to collect garbage before measuring: the idle heap is
 * then the memory the editor keeps, not what the document view left behind.
 */
const MEASURING_BROWSER_ARGUMENTS =
  '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --js-flags=--expose-gc';

interface IdleMemory {
  readonly heapMegabytes: number;
  readonly elements: number;
  readonly privateWorkingSetMegabytes: number;
}

/** A realistic mix of prose, lists, a table, code, math and links, repeated to the size asked for. */
function largeDocument(bytes: number): string {
  const sections: string[] = [];
  let size = 0;
  for (let section = 1; size < bytes; section += 1) {
    const text = [
      `## Section ${String(section)}`,
      '',
      `This paragraph has **bold**, *italic*, \`code\` and a [link](https://example.com/${String(section)}) in it, with enough words to wrap across the line like real writing does.`,
      '',
      '- First point with $x^2 + y^2$ inline math',
      '- Second point',
      '  - A nested point',
      '',
      '| Name | Value |',
      '| ---- | ----- |',
      `| Row ${String(section)} | ${String(section * 3)} |`,
      '',
      '```ts',
      `const value${String(section)} = compute(${String(section)});`,
      '```',
      '',
      '> A quote that closes the section.',
      '',
    ].join('\n');
    sections.push(text);
    size += Buffer.byteLength(text) + 1;
  }
  return sections.join('\n').slice(0, bytes);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Kept outside the repository: the numbers go into the task notes by hand. */
function record(line: string) {
  mkdirSync(RESULTS_FOLDER, { recursive: true });
  appendFileSync(`${RESULTS_FOLDER}/budgets.txt`, `${new Date().toISOString()} ${line}\n`);
}

describe('Rich text budgets', () => {
  let workspace: TestWorkspace | undefined;
  let app: DesktopApp | undefined;
  let webviewProfileFolder: string | undefined;

  afterEach(async () => {
    delete process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
    delete process.env.WEBVIEW2_USER_DATA_FOLDER;
    await app?.quit();
    app = undefined;
    workspace?.remove();
    workspace = undefined;
    if (webviewProfileFolder) {
      await webviewLetGoOf(webviewProfileFolder);
      rmSync(webviewProfileFolder, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
    webviewProfileFolder = undefined;
  });

  async function webviewLetGoOf(profileFolder: string): Promise<boolean> {
    const deadline = Date.now() + WEBVIEW_EXIT_WAIT_MS;
    while (webviewProcessCount(basename(profileFolder)) > 0) {
      if (Date.now() > deadline) return false;
      await delay(250);
    }
    return true;
  }

  async function largestPaintMs(runningApp: DesktopApp): Promise<number> {
    return runningApp.browser.execute(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            resolve(Math.max(...list.getEntries().map((entry) => entry.startTime)));
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    );
  }

  async function openLargeDocument(): Promise<MainWindowPage> {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath(LARGE_DOCUMENT), largeDocument(LARGE_DOCUMENT_BYTES));
    app = await DesktopApp.launch({ workspace, documentFileNames: [LARGE_DOCUMENT] });
    const mainWindow = new MainWindowPage(app.browser);
    const browser = app.browser;
    const startedAt = Date.now();
    // The preview draws the whole 1 MB document first, which takes seconds; the time is recorded.
    await browser
      .$('[role="tab"][aria-selected="true"]')
      .waitForExist({ timeout: LARGE_DOCUMENT_OPEN_WAIT_MS });
    await browser.$('main article').waitForExist({ timeout: LARGE_DOCUMENT_OPEN_WAIT_MS });
    record(
      `opening the 1 MB document in the preview took ${String(Date.now() - startedAt)} ms after the app started`,
    );
    return mainWindow;
  }

  async function idleMemoryIn(mode: 'richText' | 'source'): Promise<IdleMemory> {
    process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = MEASURING_BROWSER_ARGUMENTS;
    const mainWindow = await openLargeDocument();
    if (mode === 'source') await mainWindow.startEditing();
    else await mainWindow.openEditor();
    expect(await mainWindow.isEditorInRichText()).toBe(mode === 'richText');
    await delay(SETTLE_MS);
    const browser = app?.browser;
    if (!browser) throw new Error('The app is not running');
    for (let collection = 0; collection < COLLECTIONS; collection += 1) {
      await browser.execute(() => (globalThis as { gc?: () => void }).gc?.());
      await delay(1000);
    }
    const { heapBytes, elements } = await browser.execute(() => ({
      heapBytes: (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
      elements: document.getElementsByTagName('*').length,
    }));
    const memory = {
      heapMegabytes: heapBytes / BYTES_PER_MEGABYTE,
      elements,
      privateWorkingSetMegabytes: privateWorkingSetMegabytes(),
    };
    await app?.quit();
    app = undefined;
    workspace?.remove();
    workspace = undefined;
    return memory;
  }

  it('a 1 MB document in Rich text stays within the idle RAM budget', async () => {
    const source = await idleMemoryIn('source');
    const richText = await idleMemoryIn('richText');
    for (const [mode, memory] of [
      ['Source', source],
      ['Rich text', richText],
    ] as const)
      record(
        `idle with a 1 MB document in ${mode}: JS heap ${memory.heapMegabytes.toFixed(1)} MB, ${String(memory.elements)} elements, private working set of all processes ${memory.privateWorkingSetMegabytes.toFixed(1)} MB`,
      );

    expect(richText.heapMegabytes - source.heapMegabytes).toBeLessThan(RICH_TEXT_EXTRA_BUDGET_MB);
  });

  /** How long the editor works on each typed key, and how long until the key is drawn. */
  async function typingTimesIn(mode: 'richText' | 'source'): Promise<{ work: number[]; shown: number[] }> {
    const mainWindow = await openLargeDocument();
    if (mode === 'source') await mainWindow.startEditing();
    else await mainWindow.openEditor();
    await mainWindow.typeAtEndOfDocument(' ');
    await delay(2000);
    const browser = app?.browser;
    if (!browser) throw new Error('The app is not running');

    const times = await browser.execute(async (count) => {
      interface EditorViewInPage {
        readonly state: { readonly doc: { readonly length: number } };
        dispatch(transaction: { changes: { from: number; insert: string }; userEvent: string }): void;
      }
      // CodeMirror keeps its view on the content element, where its own lookup finds it.
      const content: unknown = document.querySelector('.cm-content');
      const view = (content as { cmTile?: { root?: { view?: EditorViewInPage } } } | null)?.cmTile?.root
        ?.view;
      if (!view) throw new Error('No editor view');
      const nextPaint = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      const workTimes: number[] = [];
      const shownTimes: number[] = [];
      for (let key = 0; key < count; key += 1) {
        const startedAt = performance.now();
        // The editor updates its text and its lines before dispatch returns.
        view.dispatch({ changes: { from: view.state.doc.length, insert: 'a' }, userEvent: 'input.type' });
        workTimes.push(performance.now() - startedAt);
        await nextPaint();
        shownTimes.push(performance.now() - startedAt);
      }
      return { work: workTimes, shown: shownTimes };
    }, KEYSTROKES);
    await app?.quit();
    app = undefined;
    workspace?.remove();
    workspace = undefined;
    return times;
  }

  it('typing in Rich text with a 1 MB document takes at most a frame more than in Source', async () => {
    const source = await typingTimesIn('source');
    const richText = await typingTimesIn('richText');
    for (const [mode, { work, shown }] of [
      ['Source', source],
      ['Rich text', richText],
    ] as const)
      record(
        `typing at the end of a 1 MB document in ${mode}: editor work median ${median(work).toFixed(1)} ms, slowest ${Math.max(...work).toFixed(1)} ms; to the second frame median ${median(shown).toFixed(1)} ms, slowest ${Math.max(...shown).toFixed(1)} ms`,
      );

    expect(median(richText.work) - median(source.work)).toBeLessThan(FRAME_MS);
  });

  it('the start page is drawn within the cold start budget', async () => {
    // A new WebView2 profile and data folder spend seconds being set up on the first launch only,
    // so the budget is for the second start, like every later start a user makes.
    webviewProfileFolder = mkdtempSync(join(tmpdir(), 'mdx-cold-start-'));
    process.env.WEBVIEW2_USER_DATA_FOLDER = webviewProfileFolder;
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace });
    await new MainWindowPage(app.browser).emptyStateText();
    const firstStartLargestPaintMs = await largestPaintMs(app);
    await app.quit();
    if (!(await webviewLetGoOf(webviewProfileFolder)))
      throw new Error('The webview kept its profile after the app quit');

    const launchedAt = Date.now();
    app = await DesktopApp.launch({ workspace });
    await new MainWindowPage(app.browser).emptyStateText();
    const shownAfterMs = Date.now() - launchedAt;
    const secondStartLargestPaintMs = await largestPaintMs(app);
    record(
      `first start on a new profile: largest paint ${firstStartLargestPaintMs.toFixed(0)} ms after the page began loading`,
    );
    record(
      `cold start: largest paint ${secondStartLargestPaintMs.toFixed(0)} ms after the page began loading; ${String(shownAfterMs)} ms from starting the app to the start page found by the driver`,
    );

    expect(secondStartLargestPaintMs).toBeLessThan(COLD_START_BUDGET_MS);
  });
});
