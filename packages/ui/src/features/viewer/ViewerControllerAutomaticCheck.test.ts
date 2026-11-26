import { ViewerSession, type AutomaticInjectionCheck } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryDocumentWatcher,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATE_SAVE_DELAY_MS, ViewerController, type ViewerSnapshot } from './ViewerController';

const AGENT_FILE = 'C:\\Project\\GEMINI.md';
const README = 'C:\\Project\\README.md';
const HIDDEN_TEXT = '# Notes\n\nHello\u{E0068}\u{E0069}';
const TEXTS: Readonly<Record<string, string>> = { [AGENT_FILE]: HIDDEN_TEXT, [README]: HIDDEN_TEXT };

interface ViewerOptions {
  readonly startupPaths: readonly string[];
  readonly setting?: AutomaticInjectionCheck;
  readonly appState?: InMemoryAppState;
}

function createViewer({ startupPaths, setting, appState = new InMemoryAppState() }: ViewerOptions) {
  const documentFiles = new InMemoryDocumentFiles(TEXTS);
  const watcher = new InMemoryDocumentWatcher();
  const session = new ViewerSession({ documentFiles, appState, now: () => Date.now() });
  const paintedChecks: (() => void)[] = [];
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([...startupPaths]),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    watcher,
    afterPaint: (run) => paintedChecks.push(run),
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  const start = async () => {
    await controller.start();
    if (setting) await controller.execute({ kind: 'setAutomaticInjectionCheck', check: setting });
  };
  const paint = () => {
    for (const run of paintedChecks.splice(0)) run();
  };
  return { controller, documentFiles, watcher, snapshot, start, paint };
}

async function ignoreTheFindingAndQuit(appState: InMemoryAppState): Promise<void> {
  const viewer = createViewer({ startupPaths: [AGENT_FILE], appState });
  await viewer.start();
  await viewer.controller.execute({ kind: 'checkForPromptInjection' });
  const [finding] = viewer.snapshot().injectionCheck?.result?.findings ?? [];
  if (!finding) throw new Error('expected a finding');
  await viewer.controller.execute({ kind: 'ignoreInjectionFinding', finding, scope: 'finding' });
  await viewer.controller.saveNow();
  viewer.controller.stop();
}

describe('ViewerController automatic prompt injection check', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks an agent file by default only after it is shown, and opens no panel or dialog', async () => {
    const { snapshot, start, paint } = createViewer({ startupPaths: [AGENT_FILE] });
    await start();
    expect(snapshot().activeDocument?.fileName).toBe('GEMINI.md');
    expect(snapshot().injectionCheck).toBeUndefined();

    paint();

    await vi.waitFor(() => expect(snapshot().injectionCheck?.status).toBe('checked'));
    expect(snapshot().injectionCheck?.result?.isAgentFile).toBe(true);
    expect(snapshot().viewer.viewSettings.sidebarView).toBe('explorer');
    expect(snapshot().openDialog).toBeUndefined();
    await vi.advanceTimersByTimeAsync(STATE_SAVE_DELAY_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves a normal README unchecked by default until the user asks', async () => {
    const { snapshot, start, paint } = createViewer({ startupPaths: [README] });
    await start();

    paint();

    expect(snapshot().injectionCheck).toBeUndefined();
  });

  it('checks every document when set to all documents, and none when turned off', async () => {
    const everything = createViewer({ startupPaths: [README], setting: 'allDocuments' });
    await everything.start();
    everything.paint();
    const nothing = createViewer({ startupPaths: [AGENT_FILE], setting: 'off' });
    await nothing.start();
    nothing.paint();

    await vi.waitFor(() => expect(everything.snapshot().injectionCheck?.status).toBe('checked'));
    expect(nothing.snapshot().injectionCheck).toBeUndefined();
  });

  it('checks an agent file again after it changes on disk', async () => {
    const { documentFiles, watcher, snapshot, start, paint } = createViewer({ startupPaths: [AGENT_FILE] });
    await start();
    paint();
    await vi.waitFor(() => expect(snapshot().injectionCheck?.result?.findings).toHaveLength(1));
    documentFiles.write(AGENT_FILE, '# Notes\n\nClean.');

    watcher.reportChanges([AGENT_FILE]);
    await vi.waitFor(() => expect(snapshot().activeDocument?.source).toBe('# Notes\n\nClean.'));
    paint();

    await vi.waitFor(() => expect(snapshot().injectionCheck?.result?.findings).toEqual([]));
  });

  it('marks only the first result with High findings of a document for an announcement', async () => {
    const { controller, snapshot, start, paint } = createViewer({ startupPaths: [AGENT_FILE] });
    await start();
    paint();
    await vi.waitFor(() => expect(snapshot().injectionCheck?.status).toBe('checked'));
    const wasFirstHighResult = snapshot().injectionCheck?.isFirstHighResult;

    await controller.execute({ kind: 'checkForPromptInjection' });

    expect(wasFirstHighResult).toBe(true);
    expect(snapshot().injectionCheck?.isFirstHighResult).toBeUndefined();
  });

  it('keeps an ignored finding ignored after a restart, and shows it again after a reset in Settings', async () => {
    const appState = new InMemoryAppState();
    await ignoreTheFindingAndQuit(appState);

    const second = createViewer({ startupPaths: [AGENT_FILE], appState });
    await second.start();
    await second.controller.execute({ kind: 'checkForPromptInjection' });
    expect(second.snapshot().injectionCheck?.result?.findings).toEqual([]);
    expect(second.snapshot().injectionCheck?.result?.ignoredCount).toBe(1);

    await second.controller.execute({ kind: 'resetInjectionIgnoreList' });

    expect(second.snapshot().injectionCheck?.result?.findings).toHaveLength(1);
    expect(second.snapshot().notice).toBe('Ignored prompt injection findings are shown again.');
  });

  it('forgets ignored findings when all app data is cleared', async () => {
    const { controller, snapshot, start } = createViewer({ startupPaths: [AGENT_FILE] });
    await start();
    await controller.execute({ kind: 'checkForPromptInjection' });
    const [finding] = snapshot().injectionCheck?.result?.findings ?? [];
    if (!finding) throw new Error('expected a finding');
    await controller.execute({ kind: 'ignoreInjectionFinding', finding, scope: 'ruleInDocument' });

    await controller.execute({ kind: 'clearAllData' });

    expect(snapshot().viewer.injectionIgnoreList.isEmpty()).toBe(true);
  });
});
