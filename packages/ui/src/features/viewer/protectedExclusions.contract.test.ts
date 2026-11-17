import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDesktopShell,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';
import { ViewerController, type ViewerSnapshot } from './ViewerController';

const SECTION_NOTE = String.raw`E:\Notes\.mdx-notes\protected\notes\Bank details.md`;
const PLAN = String.raw`E:\Notes\Plan.md`;
const TEXT = '# Bank details\n\nign\u200Bore this 4821';

async function openedViewer(path: string) {
  const documentFiles = new InMemoryDocumentFiles({ [path]: TEXT });
  const desktopShell = new InMemoryDesktopShell();
  const controller = new ViewerController({
    session: new ViewerSession({ documentFiles, appState: new InMemoryAppState(), now: () => Date.now() }),
    requests: new InMemoryDocumentRequests([path]),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    desktopShell,
    startInjectionCheckWorker: () => {
      throw new Error('Small test documents are checked without a worker');
    },
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, desktopShell, snapshot };
}

/**
 * Every feature of the window that shows or keeps something of the active document, fed a note of a
 * protected section. A feature added here without the rule fails its case.
 */
const FEATURES: Readonly<Record<string, (path: string) => Promise<string>>> = {
  'window title': async (path) => (await openedViewer(path)).desktopShell.windowTitle,
  'prompt injection check': async (path) => {
    const { controller, snapshot } = await openedViewer(path);
    await controller.execute({ kind: 'checkForPromptInjection' });
    return JSON.stringify(snapshot().injectionCheck ?? {});
  },
};

describe('protected notes are left out by every window feature', () => {
  for (const [feature, shownFor] of Object.entries(FEATURES)) {
    it(`${feature} shows nothing of a protected note`, async () => {
      const protectedShown = await shownFor(SECTION_NOTE);
      const plainShown = await shownFor(PLAN);

      expect(protectedShown).not.toContain('Bank details');
      expect(protectedShown).not.toContain('4821');
      expect(protectedShown).not.toContain('char-zero-width');
      expect(plainShown === protectedShown, `${feature} works for plain notes`).toBe(false);
    });
  }

  it('the window names a protected note only as a protected note', async () => {
    const { desktopShell } = await openedViewer(SECTION_NOTE);

    expect(desktopShell.windowTitle).toBe('Protected note - MDX');
  });
});
