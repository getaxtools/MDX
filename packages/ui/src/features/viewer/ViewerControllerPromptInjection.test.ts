import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
  InMemoryDocumentWatcher,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECHECK_DELAY_MS } from '../prompt-injection/InjectionCheckActions';
import { ViewerController, type ViewerSnapshot } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';
const GUIDE_TEXT = '# Guide\n\nign\u200Bore this';

const GUIDE_ONLY: Readonly<Record<string, string>> = { [GUIDE]: GUIDE_TEXT };

function createViewer({ texts = GUIDE_ONLY, appState = new InMemoryAppState() } = {}) {
  const documentFiles = new InMemoryDocumentFiles(texts);
  const watcher = new InMemoryDocumentWatcher();
  const session = new ViewerSession({ documentFiles, appState, now: () => Date.now() });
  const paintedChecks: (() => void)[] = [];
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests(Object.keys(texts)),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    watcher,
    afterPaint: (run) => paintedChecks.push(run),
    startInjectionCheckWorker: () => {
      throw new Error('Small test documents are checked without a worker');
    },
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  const paint = () => {
    for (const run of paintedChecks.splice(0)) run();
  };
  return { controller, session, documentFiles, watcher, appState, snapshot, paint };
}

const guideKey = InMemoryDocumentFiles.locationOf(GUIDE).canonicalKey;

function ruleIdsIn(snapshot: ViewerSnapshot): string[] {
  return snapshot.injectionCheck?.result?.findings.map((finding) => finding.ruleId) ?? [];
}

describe('ViewerController prompt injection check', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing without a document', async () => {
    const { controller, snapshot } = createViewer({ texts: {} });
    await controller.start();

    await controller.execute({ kind: 'checkForPromptInjection' });

    expect(snapshot().viewer.viewSettings.sidebarView).toBe('explorer');
    expect(snapshot().injectionCheck).toBeUndefined();
  });

  it('opens the findings panel and lists the result for the shown document', async () => {
    const { controller, snapshot } = createViewer();
    await controller.start();

    await controller.execute({ kind: 'checkForPromptInjection' });

    expect(snapshot().viewer.viewSettings.sidebarView).toBe('promptInjection');
    expect(snapshot().injectionCheck?.status).toBe('checked');
    expect(ruleIdsIn(snapshot())).toEqual(['char-zero-width']);
  });

  it('runs the check from the View menu item', async () => {
    const { controller, snapshot } = createViewer();
    await controller.start();

    const { commandForMenuItem } = await import('./viewerCommands');
    const command = commandForMenuItem('checkForPromptInjection');
    if (command) await controller.execute(command);

    expect(ruleIdsIn(snapshot())).toEqual(['char-zero-width']);
  });

  it('opens the source view at a finding while viewing, without changing the document', async () => {
    const { controller, snapshot } = createViewer();
    await controller.start();
    await controller.execute({ kind: 'checkForPromptInjection' });
    const [finding] = snapshot().injectionCheck?.result?.findings ?? [];
    if (!finding) throw new Error('expected a finding');

    await controller.execute({ kind: 'revealInjectionFinding', finding });

    expect(snapshot().isSourceView).toBe(true);
    expect(snapshot().sourceRangeRequest).toMatchObject({
      canonicalKey: guideKey,
      from: 12,
      to: 13,
      line: 2,
    });
    expect(snapshot().unsavedDocumentKeys.size).toBe(0);
    expect(snapshot().activeDocument?.source).toBe(GUIDE_TEXT);
  });

  it('selects a finding in the editor while editing', async () => {
    const { controller, snapshot } = createViewer();
    await controller.start();
    await controller.execute({ kind: 'toggleEditing' });
    await controller.execute({ kind: 'checkForPromptInjection' });
    const [finding] = snapshot().injectionCheck?.result?.findings ?? [];
    if (!finding) throw new Error('expected a finding');

    await controller.execute({ kind: 'revealInjectionFinding', finding });

    expect(snapshot().editorRequest).toMatchObject({
      kind: 'revealRange',
      range: { from: { line: 2, column: 3 }, to: { line: 2, column: 4 } },
    });
    expect(snapshot().isSourceView).toBeUndefined();
  });

  it('checks again once typing stops while the panel is open, and never while idle', async () => {
    const { controller, snapshot } = createViewer();
    await controller.start();
    await controller.execute({ kind: 'toggleEditing' });
    await controller.execute({ kind: 'checkForPromptInjection' });

    controller.updateEditedText(guideKey, '# Guide\n\nigno');
    controller.updateEditedText(guideKey, '# Guide\n\nignore this');
    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS - 1);
    expect(ruleIdsIn(snapshot())).toEqual(['char-zero-width']);
    await vi.advanceTimersByTimeAsync(1);

    expect(ruleIdsIn(snapshot())).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks a document shown while the panel is open once it is drawn', async () => {
    const { controller, snapshot, paint } = createViewer();
    await controller.start();
    await controller.execute({ kind: 'showSidebarView', sidebarView: 'promptInjection' });
    await vi.waitFor(() => expect(snapshot().injectionCheck?.status).toBe('checked'));
    await controller.execute({ kind: 'newDocument' });
    await vi.waitFor(() => expect(snapshot().activeDocument?.isUntitled).toBe(true));
    expect(snapshot().injectionCheck).toBeUndefined();

    paint();

    await vi.waitFor(() => expect(snapshot().injectionCheck?.status).toBe('checked'));
  });

  it('checks again after the file changes on disk while the panel is open', async () => {
    const { controller, documentFiles, watcher, snapshot, paint } = createViewer();
    await controller.start();
    await controller.execute({ kind: 'checkForPromptInjection' });
    documentFiles.write(GUIDE, '# Guide\n\nClean now.');

    watcher.reportChanges([GUIDE]);
    await vi.waitFor(() => expect(snapshot().activeDocument?.source).toBe('# Guide\n\nClean now.'));
    paint();

    await vi.waitFor(() => expect(ruleIdsIn(snapshot())).toEqual([]));
  });

  it('hides an ignored finding, counts it, and shows it again on request', async () => {
    const { controller, snapshot } = createViewer();
    await controller.start();
    await controller.execute({ kind: 'checkForPromptInjection' });
    const [finding] = snapshot().injectionCheck?.result?.findings ?? [];
    if (!finding) throw new Error('expected a finding');

    await controller.execute({ kind: 'ignoreInjectionFinding', finding, scope: 'finding' });
    expect(ruleIdsIn(snapshot())).toEqual([]);
    expect(snapshot().injectionCheck?.result?.ignoredCount).toBe(1);
    expect(snapshot().injectionCheck?.ignoredFindings).toEqual([finding]);

    await controller.execute({ kind: 'showInjectionFindingAgain', finding });
    expect(ruleIdsIn(snapshot())).toEqual(['char-zero-width']);
  });
});
