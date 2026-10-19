import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

describe('math', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    app = await DesktopApp.launch({ workspace, documentFileNames: ['math.md'] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('typesets inline and display math with KaTeX under the app content security policy', async () => {
    await mainWindow.waitForRenderedElement('.mdx-math-display .katex-display');

    expect(await mainWindow.renderedElements('.mdx-math-inline .katex')).toHaveLength(1);
  });

  it('shows a Mermaid diagram as its source', async () => {
    const codeBlocks = await mainWindow.renderedTexts('pre code');

    expect(codeBlocks.join('\n')).toContain('Draft --> Review --> Published');
  });
});
