import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('extended Markdown syntax', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['extended-syntax.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Extended syntax');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('renders alerts, definition lists, highlights, abbreviations and emoji', async () => {
    expect(await mainWindow.renderedTexts('.markdown-alert-title')).toEqual(['Tip', 'Caution']);
    expect(await mainWindow.renderedTexts('dl dt')).toEqual(['Markdown']);
    expect(await mainWindow.renderedTexts('mark')).toEqual(['highlighted words']);
    expect(await mainWindow.renderedTexts('sub')).toEqual(['2']);
    expect(await mainWindow.documentText()).toContain('Launch day 🚀');
    const abbreviations = await mainWindow.renderedElements('abbr[title="Hyper Text Markup Language"]');
    expect(abbreviations).toHaveLength(1);
  });

  it('moves to the footnote when its reference is activated', async () => {
    // Activated as the Enter key does: the embedded driver moves focus back to whatever it clicked.
    await app.browser.execute(() =>
      document.querySelector<HTMLElement>('main article sup.footnote-ref a')?.click(),
    );

    await app.browser.waitUntil(async () =>
      app.browser.execute(() => document.activeElement?.closest('.footnotes') !== null),
    );
  });

  it('meets WCAG 2.2 AA with alerts and footnotes', async () => {
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
