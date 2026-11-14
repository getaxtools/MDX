import { StartupScreen, prepareDisplayLanguage } from '@mdx/ui/startup';
import { TauriAppState } from './ports/TauriAppState';

const appState = new TauriAppState();
const displayLanguage = await prepareDisplayLanguage({
  savedState: await appState.load(),
  systemLocales: navigator.languages,
  root: document.documentElement,
});
const startupScreen = StartupScreen.attach({ document, translator: displayLanguage.translator });

startupScreen.showStage('loadingInterface');
try {
  const { startViewerApp } = await import('./startViewerApp');
  await startViewerApp({ appState, displayLanguage, startupScreen });
} catch (error) {
  startupScreen.showFailure();
  throw error;
}
