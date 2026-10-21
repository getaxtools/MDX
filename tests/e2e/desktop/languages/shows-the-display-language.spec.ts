import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const ACCENTED_TEXT = /[áéíóú]/;

describe('display language', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows every part of the window in the pseudo-language chosen in Settings', async () => {
    workspace.saveDisplayLanguage('en-XA');
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    await new MainWindowPage(app.browser).documentHeading();

    const page = await app.browser.execute(() => ({
      language: document.documentElement.lang,
      toolbar: document.querySelector('[role="toolbar"]')?.textContent ?? '',
      statusBar: document.querySelector('footer')?.textContent ?? '',
    }));

    expect(page.language).toBe('en-XA');
    expect(page.toolbar).toMatch(ACCENTED_TEXT);
    expect(page.statusBar).toMatch(ACCENTED_TEXT);
  });

  it('mirrors the window for a right-to-left language and stays accessible', async () => {
    workspace.saveDisplayLanguage('ar-XB');
    app = await DesktopApp.launch({ workspace, documentFileNames: ['getting-started.md'] });
    await new MainWindowPage(app.browser).documentHeading();

    const layout = await app.browser.execute(() => {
      const explorer = document.querySelector('nav[data-focus-region]')?.getBoundingClientRect();
      const documentArea = document.querySelector('main')?.getBoundingClientRect();
      return {
        direction: document.documentElement.dir,
        isExplorerOnTheRight: (explorer?.left ?? 0) > (documentArea?.left ?? 0),
      };
    });

    expect(layout).toEqual({ direction: 'rtl', isExplorerOnTheRight: true });
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
