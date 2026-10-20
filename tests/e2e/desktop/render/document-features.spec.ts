import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

/** A 1×1 transparent PNG. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('document features', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;

  beforeEach(() => {
    workspace = TestWorkspace.create();
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  async function open(fileName: string) {
    app = await DesktopApp.launch({ workspace, documentFileNames: [fileName] });
    mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
  }

  it('shows front matter in a properties panel instead of the text', async () => {
    await open('gfm-showcase.md');

    const properties = app.browser.$('main details');
    await properties.$('summary').click();

    expect(await properties.getText()).toContain('GitHub-flavored Markdown showcase');
    expect(await mainWindow.documentText()).not.toContain('title: GitHub-flavored');
  });

  it('copies a code block with its copy button', async () => {
    writeFileSync(workspace.documentPath('code.md'), '# Code\n\n```js\nconst answer = 42;\n```\n');
    await open('code.md');

    const copyButton = app.browser.$('main pre button');
    await copyButton.click();

    await app.browser.waitUntil(async () => (await copyButton.getText()) === 'Copied');
  });

  it('highlights code with the language it is written in', async () => {
    writeFileSync(workspace.documentPath('code.md'), '# Code\n\n```js\nconst answer = 42;\n```\n');
    await open('code.md');

    await mainWindow.waitForRenderedElement('pre code span[style]');
  });

  it('jumps to a heading from the outline', async () => {
    const sections = Array.from(
      { length: 40 },
      (_, index) => `## Section ${String(index + 1)}\n\nText.\n`,
    ).join('\n');
    writeFileSync(workspace.documentPath('sections.md'), `# Sections\n\n${sections}`);
    await open('sections.md');

    await app.browser.$('nav.outline').$('button=Section 30').click();

    await app.browser.waitUntil(
      async () => (await app.browser.execute(() => document.activeElement?.textContent)) === 'Section 30',
    );
    expect(await mainWindow.documentScrollTop()).toBeGreaterThan(0);
  });

  it('shows a relative image and opens a relative link in a new tab', async () => {
    mkdirSync(workspace.documentPath('images'));
    writeFileSync(workspace.documentPath('images/pixel.png'), PIXEL_PNG);
    writeFileSync(
      workspace.documentPath('links.md'),
      '# Links\n\n![a pixel](images/pixel.png)\n\n[Release notes](release-notes.md)\n',
    );
    await open('links.md');

    await app.browser.waitUntil(async () =>
      app.browser.execute(() => {
        const image = document.querySelector<HTMLImageElement>('main article img');
        return image !== null && image.complete && image.naturalWidth === 1;
      }),
    );
    await app.browser.$('main article').$('a=Release notes').click();

    await mainWindow.waitForTabs(['links.md', 'release-notes.md']);
    await mainWindow.waitForActiveTab('release-notes.md');
  });
});
