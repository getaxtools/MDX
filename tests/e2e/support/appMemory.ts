import { execFileSync } from 'node:child_process';

/** The UI-test app's identifier, which names its WebView2 data folder. */
const UI_TEST_APP_IDENTIFIER = 'io.github.getaxtools.mdx.uitest';
const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * The private working set of the UI-test app and all its WebView2 processes together, in
 * megabytes: the memory that is theirs alone, as Task Manager's Memory column shows it.
 */
export function privateWorkingSetMegabytes(): number {
  const script = [
    '$ids = @(Get-CimInstance Win32_Process | Where-Object {',
    `  $_.Name -eq 'mdx-ui-test.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${UI_TEST_APP_IDENTIFIER}*')`,
    '} | ForEach-Object { $_.ProcessId })',
    '$sum = (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |',
    '  Where-Object { $ids -contains $_.IDProcess } |',
    '  Measure-Object -Property WorkingSetPrivate -Sum).Sum',
    'if ($null -eq $sum) { 0 } else { $sum }',
  ].join('\n');
  const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return Number(output.trim()) / BYTES_PER_MEGABYTE;
}
