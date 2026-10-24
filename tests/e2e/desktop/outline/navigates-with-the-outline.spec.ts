import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

const SECTION_COUNT = 40;

/** A document long enough to scroll, with a table of contents written as GitHub-style links. */
function sectionsDocument(): string {
  const sections = Array.from(
    { length: SECTION_COUNT },
    (_, index) => `## Section ${String(index + 1)}\n\nText.\n`,
  ).join('\n');
  return `# Sections\n\n[Go to section 30](#section-30)\n\n${sections}`;
}

describe('navigating with the outline', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    writeFileSync(workspace.documentPath('sections.md'), sectionsDocument());
    app = await DesktopApp.launch({ workspace, documentFileNames: ['sections.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows the outline in the side bar and jumps to a heading chosen there', async () => {
    await mainWindow.showOutline();

    await mainWindow.chooseOutlineHeading('Section 30');

    await app.browser.waitUntil(
      async () => (await app.browser.execute(() => document.activeElement?.textContent)) === 'Section 30',
    );
    expect(await mainWindow.documentScrollTop()).toBeGreaterThan(0);
    await mainWindow.waitForCurrentOutlineHeading('Section 30');
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  it('follows a GitHub-style link to a heading in the same document', async () => {
    await mainWindow.clickDocumentLink('Go to section 30');

    await app.browser.waitUntil(
      async () => (await app.browser.execute(() => document.activeElement?.textContent)) === 'Section 30',
    );
    expect(await mainWindow.documentScrollTop()).toBeGreaterThan(0);
  });

  it('moves the editor caret to a heading chosen in the outline while editing', async () => {
    await mainWindow.startEditing();
    await mainWindow.showOutline();

    await mainWindow.chooseOutlineHeading('Section 30');

    await app.browser.waitUntil(async () => {
      const { scrollTop, hasFocus } = await mainWindow.editorState();
      return scrollTop > 0 && hasFocus;
    });
    await mainWindow.waitForCurrentOutlineHeading('Section 30');
  });

  it('jumps to a heading in the source view', async () => {
    await mainWindow.pressShortcut('Ctrl+U');
    await mainWindow.showOutline();

    await mainWindow.chooseOutlineHeading('Section 30');

    await app.browser.waitUntil(async () => (await mainWindow.documentScrollTop()) > 0);
  });
});
