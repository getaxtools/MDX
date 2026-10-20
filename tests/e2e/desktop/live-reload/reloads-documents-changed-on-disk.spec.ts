import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('documents changed by other programs', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('shows the new text after another program saves the open document', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['README.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();

    writeFileSync(workspace.documentPath('README.md'), '# Saved elsewhere\n');

    await mainWindow.waitForDocumentHeading('Saved elsewhere');
  });

  it('shows the new text after an editor replaces the file through a temporary copy', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['README.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    const temporaryCopy = workspace.documentPath('README.md.tmp');

    writeFileSync(temporaryCopy, '# Replaced atomically\n');
    rmSync(workspace.documentPath('README.md'));
    renameSync(temporaryCopy, workspace.documentPath('README.md'));

    await mainWindow.waitForDocumentHeading('Replaced atomically');
  });

  it('shows the new text of a background tab when it is activated', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['README.md', 'math.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.waitForActiveTab('math.md');

    writeFileSync(workspace.documentPath('README.md'), '# Changed in the background\n');
    await mainWindow.activateTab('README.md');

    await mainWindow.waitForDocumentHeading('Changed in the background');
  });

  it('keeps reloading after the app restores its tabs on the next launch', async () => {
    app = await DesktopApp.launch({ workspace, documentFileNames: ['README.md'] });
    await new MainWindowPage(app.browser).documentHeading();
    await app.browser.waitUntil(() => workspace.savedTabFileNames()?.includes('README.md') === true);
    await app.quit();
    app = await DesktopApp.launch({ workspace });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();

    writeFileSync(workspace.documentPath('README.md'), '# After restart\n');

    await mainWindow.waitForDocumentHeading('After restart');
  });

  it('keeps the scroll position when the document reloads', async () => {
    const paragraphs = Array.from({ length: 200 }, (_, index) => `Paragraph ${String(index + 1)}.`).join(
      '\n\n',
    );
    writeFileSync(workspace.documentPath('long.md'), `# Long\n\n${paragraphs}`);
    app = await DesktopApp.launch({ workspace, documentFileNames: ['long.md'] });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.scrollDocumentTo(0.5);
    await app.browser.waitUntil(() => (workspace.savedScrollRatioOf('long.md') ?? 0) > 0.4);
    const scrollTopBefore = await mainWindow.documentScrollTop();

    writeFileSync(workspace.documentPath('long.md'), `# Long, revised\n\n${paragraphs}`);

    await mainWindow.waitForDocumentHeading('Long, revised');
    expect(Math.abs((await mainWindow.documentScrollTop()) - scrollTopBefore)).toBeLessThan(50);
  });
});
