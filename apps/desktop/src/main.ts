import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { createCodeHighlighter, createMarkdownRenderer, createRichBlockRenderer } from '@mdx/renderer';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ViewerApp, ViewerController } from '@mdx/ui';
import { mount } from 'svelte';
import { TauriAppMenu } from './ports/TauriAppMenu';
import { TauriAppState } from './ports/TauriAppState';
import { TauriDocumentFiles } from './ports/TauriDocumentFiles';
import { TauriDocumentLinks } from './ports/TauriDocumentLinks';
import { TauriDocumentRequests } from './ports/TauriDocumentRequests';
import { TauriDocumentResources } from './ports/TauriDocumentResources';
import { TauriDocumentWatcher } from './ports/TauriDocumentWatcher';
import { TauriFavouritesFile } from './ports/TauriFavouritesFile';
import { TauriFolderWatcher } from './ports/TauriFolderWatcher';
import { TauriFolders } from './ports/TauriFolders';
import { WebViewPrinter } from './ports/WebViewPrinter';
import { tauriCommands } from './ports/tauriCommands';

const appElement = document.getElementById('app');
if (!appElement) throw new Error('The #app element is missing from index.html');

const translator = createTranslator();
const controller = new ViewerController({
  session: new ViewerSession({
    documentFiles: new TauriDocumentFiles(),
    appState: new TauriAppState(),
    now: () => Date.now(),
  }),
  requests: new TauriDocumentRequests(),
  renderer: createMarkdownRenderer({ window }),
  translator,
  menu: new TauriAppMenu(),
  watcher: new TauriDocumentWatcher(),
  resources: new TauriDocumentResources(),
  printer: new WebViewPrinter(),
  links: new TauriDocumentLinks(),
  folders: new TauriFolders(),
  folderWatcher: new TauriFolderWatcher(),
  favouritesFile: new TauriFavouritesFile(),
});

const appInfo = await tauriCommands.getAppInfo();
mount(ViewerApp, {
  target: appElement,
  props: {
    controller,
    translator,
    platform: 'windows',
    appInfo,
    codeHighlighter: createCodeHighlighter(),
    richBlocks: createRichBlockRenderer({ window }),
  },
});
void controller.start();
const appWindow = getCurrentWindow();
void appWindow.onCloseRequested(async (event) => {
  if (!controller.hasUnsavedDocuments()) {
    await controller.saveNow();
    return;
  }
  event.preventDefault();
  if (!(await controller.confirmClosingWindow())) return;
  await controller.saveNow();
  await appWindow.destroy();
});
