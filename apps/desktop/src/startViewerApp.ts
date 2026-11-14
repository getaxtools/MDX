import { ViewerSession, workspaceKindsFor, type WorkspaceKind } from '@mdx/core';
import { DEFAULT_LOCALE, type Translator } from '@mdx/i18n';
import { createCodeHighlighter, createMarkdownRenderer, createRichBlockRenderer } from '@mdx/renderer';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ViewerApp, ViewerController, translatedAlertTitles } from '@mdx/ui';
import type { DisplayLanguage, StartupProgress } from '@mdx/ui/startup';
import { mount } from 'svelte';
import { TauriAppMenu } from './ports/TauriAppMenu';
import { TauriAttachments } from './ports/TauriAttachments';
import type { TauriAppState } from './ports/TauriAppState';
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

export interface ViewerAppStart {
  readonly appState: TauriAppState;
  readonly displayLanguage: DisplayLanguage;
  readonly startupScreen: StartupProgress;
}

/** Loaded after the start-up screen shows, so the screen never waits for the app's code. */
export async function startViewerApp({
  appState,
  displayLanguage,
  startupScreen,
}: ViewerAppStart): Promise<void> {
  const appElement = document.getElementById('app');
  if (!appElement) throw new Error('The #app element is missing from index.html');

  const { locale, messages, translator } = displayLanguage;
  const menu = new TauriAppMenu();
  if (locale !== DEFAULT_LOCALE) await menu.showLabels(messages);
  const appInfo = await tauriCommands.getAppInfo();
  const kindRegistry = workspaceKindsFor({
    allowsPlannedKindPreview: appInfo.allowsPlannedKindPreview ?? false,
  });
  const controller = createViewerController({ appState, menu, translator, kindRegistry });
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
  saveOrAskBeforeClosing(controller);

  startupScreen.showStage('restoringDocuments');
  try {
    await controller.start();
  } finally {
    startupScreen.finish();
  }
}

interface ViewerControllerSources {
  readonly appState: TauriAppState;
  readonly menu: TauriAppMenu;
  readonly translator: Translator;
  readonly kindRegistry: readonly WorkspaceKind[];
}

function createViewerController({
  appState,
  menu,
  translator,
  kindRegistry,
}: ViewerControllerSources): ViewerController {
  return new ViewerController({
    session: new ViewerSession({
      documentFiles: new TauriDocumentFiles(),
      appState,
      now: () => Date.now(),
      kindRegistry,
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
    attachments: new TauriAttachments(),
  });
}

function saveOrAskBeforeClosing(controller: ViewerController): void {
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
}
