import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { createMarkdownRenderer } from '@mdx/renderer';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ViewerApp, ViewerController } from '@mdx/ui';
import { mount } from 'svelte';
import { TauriAppState } from './ports/TauriAppState';
import { TauriDocumentFiles } from './ports/TauriDocumentFiles';
import { TauriDocumentRequests } from './ports/TauriDocumentRequests';

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
});

mount(ViewerApp, { target: appElement, props: { controller, translator, platform: 'windows' } });
void controller.start();
void getCurrentWindow().onCloseRequested(() => controller.saveNow());
