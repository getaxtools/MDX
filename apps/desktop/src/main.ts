import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { createCodeHighlighter, createMarkdownRenderer } from '@mdx/renderer';
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
});

const appInfo = await tauriCommands.getAppInfo();
mount(ViewerApp, {
  target: appElement,
  props: { controller, translator, platform: 'windows', appInfo, codeHighlighter: createCodeHighlighter() },
});
void controller.start();
void getCurrentWindow().onCloseRequested(() => controller.saveNow());
