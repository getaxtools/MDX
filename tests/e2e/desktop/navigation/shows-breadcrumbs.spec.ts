import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('breadcrumbs', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['release-notes.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForDocumentHeading('Release notes');
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows the folder and the document, and jumps to a heading from the heading list', async () => {
    const trail = app.browser.$('nav[aria-label="Breadcrumbs"]');
    await trail.waitForDisplayed();
    expect(await trail.getText()).toContain('documents');
    expect(await trail.getText()).toContain('release-notes.md');

    // Activated as the keyboard does: the embedded driver moves focus back to what it clicked,
    // which closes the menu as soon as it opens.
    await app.browser.execute(() =>
      document
        .querySelector<HTMLElement>('nav[aria-label="Breadcrumbs"] button[aria-haspopup="menu"]')
        ?.click(),
    );
    await app.browser.$('[role="menu"]').waitForDisplayed();
    await app.browser.execute(() =>
      [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
        .find((item) => item.textContent.trim() === 'Version 1.0')
        ?.click(),
    );

    await app.browser.waitUntil(async () =>
      app.browser.execute(() => document.activeElement?.textContent.trim() === 'Version 1.0'),
    );
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
