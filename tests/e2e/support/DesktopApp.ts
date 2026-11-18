import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { remote } from 'webdriverio';
import type { TestWorkspace } from './TestWorkspace';

const UI_TEST_APP_NAME = process.platform === 'win32' ? 'mdx-ui-test.exe' : 'mdx-ui-test';
const UI_TEST_APP_PATH = join(
  import.meta.dirname,
  ...['..', '..', '..', 'apps', 'desktop', 'src-tauri', 'target', 'debug', UI_TEST_APP_NAME],
);
const LOCALHOST = '127.0.0.1';
const DRIVER_READY_TIMEOUT_MS = 30_000;
const DRIVER_POLL_INTERVAL_MS = 100;
const APP_EXIT_TIMEOUT_MS = 10_000;
/**
 * Each launch gets a WebView2 profile of its own here. WebView2 still holds its profile for a moment
 * after the app exits, so the profiles live outside the test's folder, which is removed at once.
 */
const WEBVIEW_PROFILES_FOLDER = join(tmpdir(), 'mdx-ui-test-webview');
let launchCount = 0;

export interface LaunchOptions {
  readonly workspace: TestWorkspace;
  readonly documentFileNames?: readonly string[];
  /** More environment variables for the app, such as the folders a debug build answers its folder picker with. */
  readonly environment?: Readonly<Record<string, string>>;
}

export class DesktopApp {
  private constructor(
    readonly browser: WebdriverIO.Browser,
    private readonly appProcess: ChildProcess,
    private readonly driverPort: number,
  ) {}

  static async launch({
    workspace,
    documentFileNames = [],
    environment = {},
  }: LaunchOptions): Promise<DesktopApp> {
    const driverPort = await findFreePort();
    launchCount += 1;
    removeUnusedWebViewProfiles();
    const appProcess = spawn(UI_TEST_APP_PATH, documentPaths(workspace, documentFileNames), {
      env: {
        // WebView2 lets go of its profile a little after the app exits, and an app started
        // meanwhile on the same profile fails to start, so no two launches share one, unless the
        // spec chose a profile itself.
        WEBVIEW2_USER_DATA_FOLDER: join(
          WEBVIEW_PROFILES_FOLDER,
          `${String(process.pid)}-${String(launchCount)}`,
        ),
        ...process.env,
        MDX_DATA_DIR: workspace.profileFolder,
        MDX_DOCUMENTS_DIR: workspace.homeDocumentsFolder,
        TAURI_WEBDRIVER_PORT: String(driverPort),
        ...environment,
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    try {
      await waitForDriver(driverPort, appProcess);
      const browser = await remote({
        hostname: LOCALHOST,
        port: driverPort,
        logLevel: 'warn',
        capabilities: { 'wdio:enforceWebDriverClassic': true },
      });
      return new DesktopApp(browser, appProcess, driverPort);
    } catch (error) {
      // An app left running would take every later launch as a second instance of it.
      appProcess.kill();
      throw error;
    }
  }

  /** Starts a second copy of the app, the way Explorer does, and waits for it to hand over and exit. */
  static async launchSecondInstance({ workspace, documentFileNames = [] }: LaunchOptions): Promise<void> {
    const secondInstance = spawn(UI_TEST_APP_PATH, documentPaths(workspace, documentFileNames), {
      env: { ...process.env, MDX_DATA_DIR: workspace.profileFolder },
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(secondInstance, 'exit');
  }

  async quit(): Promise<void> {
    if (hasExited(this.appProcess)) return;
    const exited = once(this.appProcess, 'exit');
    await this.closeMainWindow();
    if (await exitsWithin(exited, APP_EXIT_TIMEOUT_MS)) return;
    this.appProcess.kill();
    await exited;
  }

  /**
   * Closes the window with a bare WebDriver request. WebdriverIO's `closeWindow` follows up by
   * switching to another window, a request the exiting app can no longer answer.
   */
  private async closeMainWindow(): Promise<void> {
    const windowUrl = `http://${LOCALHOST}:${String(this.driverPort)}/session/${this.browser.sessionId}/window`;
    await fetch(windowUrl, { method: 'DELETE' }).catch(() => undefined);
  }
}

function hasExited(appProcess: ChildProcess): boolean {
  return appProcess.exitCode !== null || appProcess.signalCode !== null;
}

async function exitsWithin(exited: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const timeout = new AbortController();
  const timedOut = delay(timeoutMs, false, { signal: timeout.signal }).catch(() => false);
  const hasExitedInTime = await Promise.race([exited.then(() => true), timedOut]);
  timeout.abort();
  return hasExitedInTime;
}

/** Profiles of earlier launches; one WebView2 still holds is left for a later launch to remove. */
function removeUnusedWebViewProfiles(): void {
  let profiles: string[];
  try {
    profiles = readdirSync(WEBVIEW_PROFILES_FOLDER);
  } catch {
    return;
  }
  for (const profile of profiles) {
    try {
      rmSync(join(WEBVIEW_PROFILES_FOLDER, profile), { recursive: true, force: true });
    } catch {
      // Still in use by a WebView2 that has not let go of it yet.
    }
  }
}

function documentPaths(workspace: TestWorkspace, fileNames: readonly string[]): string[] {
  return fileNames.map((fileName) => workspace.documentPath(fileName));
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  server.listen(0, LOCALHOST);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForDriver(port: number, appProcess: ChildProcess): Promise<void> {
  const deadline = Date.now() + DRIVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (hasExited(appProcess)) {
      throw new Error(
        `The UI test app exited with code ${String(appProcess.exitCode)} before its driver started`,
      );
    }
    if (await isDriverReady(port)) return;
    await delay(DRIVER_POLL_INTERVAL_MS);
  }
  throw new Error(`The UI test app driver did not start within ${String(DRIVER_READY_TIMEOUT_MS)} ms`);
}

async function isDriverReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${LOCALHOST}:${String(port)}/status`);
    return response.ok;
  } catch {
    return false;
  }
}
