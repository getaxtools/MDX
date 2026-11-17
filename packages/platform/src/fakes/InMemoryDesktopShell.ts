import type { DesktopShellPort } from '../DesktopShellPort';

export class InMemoryDesktopShell implements DesktopShellPort {
  clipboardText = '';
  clipboardHtml = '';
  isClipboardBlocked = false;
  readonly revealedPaths: string[] = [];
  isFullScreen = false;
  languageSettingsOpenings = 0;
  windowTitle = '';
  /** Paths that cannot be shown, such as ones the app was never allowed to open. */
  readonly unrevealablePaths = new Set<string>();

  /** How many times the clipboard was read, which only Paste as Plain Text does. */
  clipboardReads = 0;

  readClipboardText(): Promise<string> {
    this.clipboardReads += 1;
    if (this.isClipboardBlocked) return Promise.reject(new Error('The clipboard is not available'));
    return Promise.resolve(this.clipboardText);
  }

  writeClipboardText(text: string): Promise<void> {
    if (this.isClipboardBlocked) return Promise.reject(new Error('The clipboard is not available'));
    this.clipboardText = text;
    return Promise.resolve();
  }

  writeClipboardHtml(html: string): Promise<void> {
    if (this.isClipboardBlocked) return Promise.reject(new Error('The clipboard is not available'));
    this.clipboardHtml = html;
    this.clipboardText = html;
    return Promise.resolve();
  }

  revealInFileManager(path: string): Promise<void> {
    if (this.unrevealablePaths.has(path)) return Promise.reject(new Error(`Cannot reveal ${path}`));
    this.revealedPaths.push(path);
    return Promise.resolve();
  }

  setWindowTitle(title: string): Promise<void> {
    this.windowTitle = title;
    return Promise.resolve();
  }

  openLanguageSettings(): Promise<void> {
    this.languageSettingsOpenings += 1;
    return Promise.resolve();
  }

  toggleFullScreen(): Promise<void> {
    this.isFullScreen = !this.isFullScreen;
    return Promise.resolve();
  }
}
