/** What the app asks of the desktop around it: the clipboard, the file manager and the window. */
export interface DesktopShellPort {
  writeClipboardText(text: string): Promise<void>;
  /** Puts HTML on the clipboard as rich text, and its markup as plain text. */
  writeClipboardHtml(html: string): Promise<void>;
  /** Shows a file or folder in the system file manager, such as File Explorer, with it selected. */
  revealInFileManager(path: string): Promise<void>;
  toggleFullScreen(): Promise<void>;
}
