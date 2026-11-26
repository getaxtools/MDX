import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

/** The UI-test app's identifier, which names its WebView2 data folder. */
const UI_TEST_APP_IDENTIFIER = 'io.github.getaxtools.mdx.uitest';

/**
 * The TCP connections the UI-test app and its WebView2 processes hold to anything but this
 * machine, as `address:port state`; its webview processes are told apart by their data folder. The webview's own downloads, such as spelling dictionaries,
 * do not show in the page's resource list, so they are looked for here.
 */
export function outsideConnectionsOfTheApp(webviewDataFolder: string = UI_TEST_APP_IDENTIFIER): string[] {
  const script = [
    '$ids = @(Get-CimInstance Win32_Process | Where-Object {',
    `  $_.Name -eq 'mdx-ui-test.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${webviewDataFolder}*')`,
    '} | ForEach-Object { $_.ProcessId })',
    'if ($ids.Count -eq 0) { exit 0 }',
    'Get-NetTCPConnection -OwningProcess $ids -ErrorAction SilentlyContinue |',
    "  Where-Object { $_.RemoteAddress -notin @('127.0.0.1', '::1', '0.0.0.0', '::') } |",
    '  ForEach-Object { "$($_.RemoteAddress):$($_.RemotePort) $($_.State)" }',
    // A process without connections makes the lookup report an error the output does not need.
    'exit 0',
  ].join('\n');
  const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** How many WebView2 processes use the data folder, so a check of their connections is known to see them. */
export function webviewProcessCount(webviewDataFolder: string = UI_TEST_APP_IDENTIFIER): number {
  const script = [
    '@(Get-CimInstance Win32_Process | Where-Object {',
    `  $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${webviewDataFolder}*'`,
    '}).Count',
  ].join('\n');
  const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return Number.parseInt(output.trim(), 10) || 0;
}

/**
 * Spelling dictionaries a WebView2 data folder holds: the webview downloads one for a language
 * Windows has none for, unless that is turned off.
 */
export function downloadedSpellingDictionaries(userDataFolder: string): string[] {
  if (!existsSync(userDataFolder)) return [];
  return readdirSync(userDataFolder, { recursive: true, encoding: 'utf8' }).filter((path) =>
    path.toLowerCase().endsWith('.bdic'),
  );
}
