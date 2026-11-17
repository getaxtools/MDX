import { execFileSync } from 'node:child_process';

const CLIPBOARD_TEXT_VARIABLE = 'MDX_TEST_CLIPBOARD_TEXT';

function runPowerShell(script: string, text?: string): string {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: text === undefined ? process.env : { ...process.env, [CLIPBOARD_TEXT_VARIABLE]: text },
  });
}

/**
 * The Windows clipboard, for tests that paste the way the user does. A test saves the user's
 * clipboard first and restores it afterwards; only text can be put back, so a picture or any other
 * format the user had copied is replaced by nothing.
 */
export class WindowsClipboard {
  private constructor(private readonly savedText: string | null) {}

  /** Remembers the clipboard's text, or that it held none. */
  static save(): WindowsClipboard {
    const json = runPowerShell(
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ConvertTo-Json -InputObject (Get-Clipboard -Raw)',
    );
    return new WindowsClipboard(JSON.parse(json) as string | null);
  }

  /** Puts plain text on the clipboard as another program would; the text is passed outside the script. */
  setText(text: string): void {
    runPowerShell(`Set-Clipboard -Value $env:${CLIPBOARD_TEXT_VARIABLE}`, text);
  }

  /** Puts back the text saved at the start, or empties the clipboard when it held none. */
  restore(): void {
    if (this.savedText === null || this.savedText === '') {
      runPowerShell('Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::Clear()');
      return;
    }
    this.setText(this.savedText);
  }
}
