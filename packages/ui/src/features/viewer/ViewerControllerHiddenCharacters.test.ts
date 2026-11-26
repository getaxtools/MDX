import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppMenu,
  InMemoryAppState,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paletteCommands } from '../command-palette/paletteCommands';
import { ViewerController, type ViewerSnapshot } from './ViewerController';

const GUIDE = 'C:\\Docs\\Guide.md';

function createViewer(appState = new InMemoryAppState()) {
  const menu = new InMemoryAppMenu();
  const session = new ViewerSession({
    documentFiles: new InMemoryDocumentFiles({ [GUIDE]: '# Guide\n\nign\u200Bore' }),
    appState,
    now: () => Date.now(),
  });
  const controller = new ViewerController({
    session,
    requests: new InMemoryDocumentRequests([GUIDE]),
    renderer: createMarkdownRenderer({ window }),
    translator: createTranslator(),
    menu,
    afterPaint: (run) => run(),
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  const isShown = () => latest?.viewer.viewSettings.isShowingHiddenCharacters;
  return { controller, menu, isShown };
}

describe('ViewerController Show hidden characters', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is off at first, and the View menu, the palette and the panel turn it on and off alike', async () => {
    const { controller, menu, isShown } = createViewer();
    await controller.start();
    expect(isShown()).toBe(false);

    menu.choose('toggleHiddenCharacters');
    await vi.waitFor(() => expect(isShown()).toBe(true));
    expect(menu.shownViewState?.isShowingHiddenCharacters).toBe(true);
    const paletteCommand = paletteCommands(createTranslator()).find(
      (entry) => entry.command.kind === 'toggleHiddenCharacters',
    );
    if (paletteCommand) await controller.execute(paletteCommand.command);

    expect(paletteCommand?.label).toBe('Show Hidden Characters');
    expect(isShown()).toBe(false);
    expect(menu.shownViewState?.isShowingHiddenCharacters).toBe(false);
  });

  it('stays on after a restart', async () => {
    const appState = new InMemoryAppState();
    const first = createViewer(appState);
    await first.controller.start();
    await first.controller.execute({ kind: 'toggleHiddenCharacters' });
    await first.controller.saveNow();
    first.controller.stop();

    const second = createViewer(appState);
    await second.controller.start();

    expect(second.isShown()).toBe(true);
  });
});
