import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('rendering GitHub-flavored Markdown', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['gfm-showcase.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('renders tables, task lists, strikethrough, links and code blocks', async () => {
    const tableRows = await mainWindow.renderedElements('table tr');
    const checkboxes = await mainWindow.renderedElements('input[type="checkbox"]');
    const struckText = await mainWindow.renderedTexts('s, del');
    const linkTexts = await mainWindow.renderedTexts('a');
    const taskLabels = await mainWindow.renderedTexts('li > label');
    const codeBlocks = await mainWindow.renderedTexts('pre code');

    expect(tableRows).toHaveLength(3);
    expect(checkboxes).toHaveLength(2);
    expect(await checkboxes[0]?.isSelected()).toBe(true);
    expect(await checkboxes[1]?.isSelected()).toBe(false);
    expect(struckText).toEqual(['struck through']);
    expect(taskLabels).toEqual(['Completed task', 'Open task']);
    expect(linkTexts).toContain('https://example.com');
    expect(codeBlocks).toEqual(["const greeting = 'hello';"]);
  });

  it('hides the front matter block', async () => {
    const documentText = await mainWindow.documentText();

    expect(documentText).not.toContain('title: GitHub-flavored Markdown showcase');
  });

  it('meets WCAG 2.2 AA for a rendered document', async () => {
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });
});
