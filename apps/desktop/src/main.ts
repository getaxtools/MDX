import { ViewerSession } from '@mdx/core';
import { DEFAULT_LOCALE } from '@mdx/i18n';
import { createCodeHighlighter, createMarkdownRenderer, createRichBlockRenderer } from '@mdx/renderer';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ViewerApp, ViewerController, prepareDisplayLanguage, translatedAlertTitles } from '@mdx/ui';
import { mount } from 'svelte';
import { TauriAppMenu } from './ports/TauriAppMenu';
import { TauriAppState } from './ports/TauriAppState';
import { TauriDocumentFiles } from './ports/TauriDocumentFiles';
import { TauriDocumentLinks } from './ports/TauriDocumentLinks';
import { TauriDocumentRequests } from './ports/TauriDocumentRequests';
import { TauriDocumentResources } from './ports/TauriDocumentResources';
import { TauriDesktopShell } from './ports/TauriDesktopShell';
import { TauriDocumentExport } from './ports/TauriDocumentExport';
import { TauriDocumentWatcher } from './ports/TauriDocumentWatcher';
import { TauriFavouritesFile } from './ports/TauriFavouritesFile';
import { TauriFolderWatcher } from './ports/TauriFolderWatcher';
import { TauriFolders } from './ports/TauriFolders';
import { WebViewPrinter } from './ports/WebViewPrinter';
import { tauriCommands } from './ports/tauriCommands';
import { loadThirdPartyLicenses } from './loadThirdPartyLicenses';

const appElement = document.getElementById('app');
if (!appElement) throw new Error('The #app element is missing from index.html');

const appState = new TauriAppState();
const menu = new TauriAppMenu();
const { locale, messages, translator } = await prepareDisplayLanguage({
  savedState: await appState.load(),
  systemLocales: navigator.languages,
  root: document.documentElement,
});
if (locale !== DEFAULT_LOCALE) await menu.showLabels(messages);

const controller = new ViewerController({
  session: new ViewerSession({
    documentFiles: new TauriDocumentFiles(),
    appState,
    now: () => Date.now(),
  }),
  requests: new TauriDocumentRequests(),
  renderer: createMarkdownRenderer({ window, alertTitles: translatedAlertTitles(translator) }),
  translator,
  menu,
  watcher: new TauriDocumentWatcher(),
  resources: new TauriDocumentResources(),
  printer: new WebViewPrinter(),
  links: new TauriDocumentLinks(),
  folders: new TauriFolders(),
  folderWatcher: new TauriFolderWatcher(),
  favouritesFile: new TauriFavouritesFile(),
  desktopShell: new TauriDesktopShell(),
  documentExport: new TauriDocumentExport(),
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
    loadThirdPartyLicenses,
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
