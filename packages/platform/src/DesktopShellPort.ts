/** What the app asks of the desktop around it: the clipboard, the file manager and the window. */
export interface DesktopShellPort {
  writeClipboardText(text: string): Promise<void>;
  /**
   * The clipboard's plain text, without control characters other than tab and line break, for
   * Paste as Plain Text only; refused with `tooLarge` above the editor's 1 MB limit.
   */
  readClipboardText(): Promise<string>;
  /** Puts HTML on the clipboard as rich text, and its markup as plain text. */
  writeClipboardHtml(html: string): Promise<void>;
  /** Shows a file or folder in the system file manager, such as File Explorer, with it selected. */
  revealInFileManager(path: string): Promise<void>;
  toggleFullScreen(): Promise<void>;
  /** The title bar and taskbar text, such as the document and workspace names. */
  setWindowTitle(title: string): Promise<void>;
}
