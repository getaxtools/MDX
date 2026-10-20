import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { TestWorkspace } from '../../support/TestWorkspace';

const APP_HOSTS = new Set(['tauri.localhost', 'ipc.localhost', 'mdx-image.localhost']);
const REMOTE_DOCUMENT = 'remote-content.md';

describe('privacy', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;

  beforeEach(() => {
    workspace = TestWorkspace.create();
    writeFileSync(
      workspace.documentPath(REMOTE_DOCUMENT),
      [
        '# Remote content',
        '',
        '![tracking pixel](https://example.com/pixel.png)',
        '',
        '<img src="https://example.com/inline.png" alt="inline">',
        '',
        '[a web link](https://example.com/page)',
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await app.quit();
    workspace.remove();
  });

  it('loads nothing from the network while showing documents with remote images, math and code', async () => {
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: ['gfm-showcase.md', 'math.md', REMOTE_DOCUMENT],
    });
    const mainWindow = new MainWindowPage(app.browser);
    await mainWindow.documentHeading();
    await mainWindow.activateTab('math.md');
    await mainWindow.waitForRenderedElement('.katex');
    await mainWindow.activateTab('gfm-showcase.md');
    await mainWindow.documentHeading();

    const loadedUrls = await app.browser.execute(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );

    const outsideTheApp = loadedUrls.filter((url) => !APP_HOSTS.has(new URL(url).hostname));
    expect(outsideTheApp).toEqual([]);
    expect(loadedUrls.length).toBeGreaterThan(0);
  });
});
