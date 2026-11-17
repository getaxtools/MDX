import type { DesktopShellPort } from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { tauriCommands } from './tauriCommands';

export class TauriDesktopShell implements DesktopShellPort {
  writeClipboardText(text: string): Promise<void> {
    return globalThis.navigator.clipboard.writeText(text);
  }

  async readClipboardText(): Promise<string> {
    try {
      return await tauriCommands.readClipboardText();
    } catch (error) {
      throw documentOpenErrorOf(error, '');
    }
  }

  writeClipboardHtml(html: string): Promise<void> {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([html], { type: 'text/plain' }),
    });
    return globalThis.navigator.clipboard.write([item]);
  }

  async revealInFileManager(path: string): Promise<void> {
    await tauriCommands.revealInFileManager(path);
  }

  async setWindowTitle(title: string): Promise<void> {
    document.title = title;
    await tauriCommands.setWindowTitle(title);
  }

  async openLanguageSettings(): Promise<void> {
    await tauriCommands.openLanguageSettings();
  }

  async toggleFullScreen(): Promise<void> {
    await tauriCommands.toggleFullScreen();
  }
}
