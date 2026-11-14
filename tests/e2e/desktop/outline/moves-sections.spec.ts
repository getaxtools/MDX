import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const DOCUMENT = 'sections.md';

describe('moving sections from the outline', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(
      workspace.documentPath(DOCUMENT),
      '# Guide\r\n\r\n## A\r\n\r\nOne.\r\n\r\n## B\r\n\r\nTwo.\r\n',
    );
    app = await DesktopApp.launch({ workspace, documentFileNames: [DOCUMENT] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.showOutline();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('reorder two sections from the outline and the tab shows unsaved changes', async () => {
    const sectionA = await mainWindow.outline().$('button=A').getElement();
    await app.browser.execute((button) => button.focus(), sectionA);

    await mainWindow.pressShortcut('Alt+Shift+ArrowDown');

    await mainWindow.waitForUnsavedTab(DOCUMENT);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await mainWindow.pressShortcut('Ctrl+S');
    await mainWindow.waitForSavedTab(DOCUMENT);
    expect(readFileSync(workspace.documentPath(DOCUMENT), 'utf8')).toBe(
      '# Guide\r\n\r\n## B\r\n\r\nTwo.\r\n\r\n## A\r\n\r\nOne.\r\n',
    );
  });
});
