import { listen } from '@tauri-apps/api/event';
import type { AppMenuPort, MenuCommandListener, ViewMenuState } from '@mdx/platform';
import { MENU_COMMAND_EVENT, tauriCommands } from './tauriCommands';

export class TauriAppMenu implements AppMenuPort {
  onMenuCommand(listener: MenuCommandListener): () => void {
    const stopListening = listen<string>(MENU_COMMAND_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }

  async showViewState(state: ViewMenuState): Promise<void> {
    await tauriCommands.updateViewMenu(state);
  }
}
