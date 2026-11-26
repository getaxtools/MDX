import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ControlWheelPage } from '../../pages/ControlWheelPage';
import { MainWindowPage } from '../../pages/MainWindowPage';
import { DesktopApp } from '../../support/DesktopApp';
import { DevTools, devToolsBrowserArguments, freeDevToolsPort } from '../../support/DevTools';
import { findAccessibilityViolations } from '../../support/findAccessibilityViolations';
import { TestWorkspace } from '../../support/TestWorkspace';

/**
 * Records what the control wheel's manual passes can measure: screenshots per theme and backdrop,
 * contrast ratios, long frames while it opens, the names assistive technology reads, reduced motion
 * and the shortcut during input method composition. What it writes goes to MDX_WHEEL_PASS_FOLDER.
 */
const PASS_FOLDER = process.env.MDX_WHEEL_PASS_FOLDER ?? join(tmpdir(), 'mdx-wheel-passes');
const THEMES = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['sepia', 'Sepia'],
  ['nord', 'Nord'],
  ['highContrast', 'High Contrast'],
] as const;
const BACKDROPS = [
  ['white page', 'white.md', [255, 255, 255]],
  ['dark image', 'dark.md', [18, 20, 26]],
] as const;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_NON_TEXT_CONTRAST = 3;
/** A long animation frame or long task is one of 50 ms or more, by the browsers' own definition. */
const LONG_FRAME_MS = 50;
/** Frames with little work of the page's own have taken up to 180 ms on a busy machine; far more means the wheel is slow to draw. */
const OPENING_FRAME_CEILING_MS = 300;
const SETTLE_MS = 600;
const OPEN_MOTION_BUDGET_MS = 200;
const MICROSECONDS_PER_MILLISECOND = 1000;

const findings: string[] = [];

function record(line: string): void {
  findings.push(line);
}

interface TraceEvent {
  name?: string;
  dur?: number;
  ph?: string;
  pid?: number;
  tid?: number;
  args?: { name?: string };
}

interface PageLongFrame {
  type: string;
  durationMs: number;
  /** A lower bound: the frame lists only scripts of 5 ms or more, and no work that runs no script. */
  ownWorkMs: number;
}

/** Only the page's main thread counts, because GPU and browser process tasks include time blocked on the system. */
function pageMainThreadTasks(traceEvents: readonly TraceEvent[]): TraceEvent[] {
  const pageMainThreads = new Set(
    traceEvents
      .filter(
        (event) => event.ph === 'M' && event.name === 'thread_name' && event.args?.name === 'CrRendererMain',
      )
      .map((event) => `${String(event.pid)}:${String(event.tid)}`),
  );
  return traceEvents.filter(
    (event) => event.name === 'RunTask' && pageMainThreads.has(`${String(event.pid)}:${String(event.tid)}`),
  );
}

/** A plain PNG of one colour, so the wheel can be seen over a known page. */
function solidPng(width: number, height: number, [red, green, blue]: readonly number[]): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([red ?? 0, green ?? 0, blue ?? 0], 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface WheelContrast {
  readonly rimOnTile: number;
  readonly captionText: number;
}

describe('control wheel passes', () => {
  let workspace: TestWorkspace;
  let app: DesktopApp;
  let mainWindow: MainWindowPage;
  let controlWheel: ControlWheelPage;
  let devTools: DevTools;

  beforeAll(() => mkdirSync(PASS_FOLDER, { recursive: true }));

  afterAll(() => {
    writeFileSync(join(PASS_FOLDER, 'measurements.txt'), `${findings.join('\n')}\n`);
  });

  beforeEach(async () => {
    workspace = TestWorkspace.create();
    for (const [, fileName, colour] of BACKDROPS) {
      const picture = fileName.replace('.md', '.png');
      writeFileSync(workspace.documentPath(picture), solidPng(1600, 2400, colour));
      writeFileSync(workspace.documentPath(fileName), `![backdrop](${picture})\n`);
    }
    const port = await freeDevToolsPort();
    app = await DesktopApp.launch({
      workspace,
      documentFileNames: BACKDROPS.map(([, fileName]) => fileName),
      environment: { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: devToolsBrowserArguments(port) },
    });
    devTools = await DevTools.connect(port);
    mainWindow = new MainWindowPage(app.browser);
    controlWheel = new ControlWheelPage(app.browser, mainWindow);
    await mainWindow.waitForTabs(BACKDROPS.map(([, fileName]) => fileName));
    await controlWheel.openControlWheel();
    await controlWheel.openKindSettings();
    await controlWheel.setKindEnabled('Notes', true);
    await controlWheel.setKindEnabled('Spec viewer', true);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    // The backdrop fills the whole width, so the wheel lies on it wherever it opens.
    await mainWindow.searchInCommandPalette('>Reading Width: Full Width');
    await mainWindow.waitForCommandPaletteOption('Reading Width: Full Width');
    await mainWindow.pressShortcut('Enter');
  });

  afterEach(async () => {
    devTools.close();
    await app.quit();
    workspace.remove();
  });

  async function emulate(features: readonly { name: string; value: string }[]): Promise<void> {
    await devTools.send('Emulation.setEmulatedMedia', { features });
  }

  async function chooseTheme(label: string): Promise<void> {
    await mainWindow.searchInCommandPalette(`>Theme: ${label}`);
    await mainWindow.waitForCommandPaletteOption(`Theme: ${label}`);
    await mainWindow.pressShortcut('Enter');
  }

  async function screenshot(name: string): Promise<void> {
    await app.browser.pause(SETTLE_MS);
    await app.browser.saveScreenshot(join(PASS_FOLDER, `${name}.png`));
  }

  /** Contrast of the active rim on its tile, and of the caption text on its pill over the page colour. */
  async function wheelContrast(pageColour: readonly number[]): Promise<WheelContrast> {
    return app.browser.execute((page) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No canvas');
      const rgbaOf = (colour: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data;
        return { rgb: [red, green, blue], alpha: alpha / 255 };
      };
      const over = (top: { rgb: number[]; alpha: number }, bottom: readonly number[]) =>
        top.rgb.map((value, index) => value * top.alpha + (bottom[index] ?? 0) * (1 - top.alpha));
      const luminance = (rgb: readonly number[]) => {
        const [red = 0, green = 0, blue = 0] = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const ratio = (first: readonly number[], second: readonly number[]) => {
        const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
        return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
      };
      const rim = document.querySelector('.rim');
      const tile = rim?.closest('.segment-tile')?.querySelector('.tile');
      const caption = document.querySelector('[data-testid="wheel-caption"]');
      const name = caption?.querySelector('.name');
      if (!rim || !tile || !caption || !name) throw new Error('The wheel is not drawn as expected');
      const tileColour = over(rgbaOf(getComputedStyle(tile).fill), page);
      const rimColour = over(rgbaOf(getComputedStyle(rim).stroke), tileColour);
      const pillColour = over(rgbaOf(getComputedStyle(caption).backgroundColor), page);
      const textColour = over(rgbaOf(getComputedStyle(name).color), pillColour);
      return { rimOnTile: ratio(rimColour, tileColour), captionText: ratio(textColour, pillColour) };
    }, pageColour);
  }

  it('looks right in every theme over a white page and a dark image, with readable contrast', async () => {
    for (const [themeId, themeLabel] of THEMES) {
      await chooseTheme(themeLabel);
      for (const [backdrop, fileName, colour] of BACKDROPS) {
        await mainWindow.activateTab(fileName);
        await controlWheel.openControlWheel();
        const contrast = await wheelContrast(colour);
        const fonts = await app.browser.execute(() => {
          const caption = document.querySelector('[data-testid="wheel-caption"]');
          const shell = document.querySelector('.app-shell');
          return [caption, shell].map((element) => (element ? getComputedStyle(element).fontFamily : ''));
        });
        expect(fonts[0], 'the caption uses the interface font').toBe(fonts[1]);
        record(
          `contrast ${themeId} over ${backdrop}: rim on tile ${contrast.rimOnTile.toFixed(2)}:1, caption text ${contrast.captionText.toFixed(2)}:1`,
        );
        await screenshot(`wheel-${themeId}-${fileName.replace('.md', '')}`);
        await controlWheel.openKindSettings();
        await screenshot(`gear-${themeId}-${fileName.replace('.md', '')}`);
        await controlWheel.pressInWheel('Escape');
        await controlWheel.pressInWheel('Escape');
        await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
        expect(contrast.rimOnTile, `${themeId} rim over ${backdrop}`).toBeGreaterThanOrEqual(
          MIN_NON_TEXT_CONTRAST,
        );
        expect(contrast.captionText, `${themeId} caption over ${backdrop}`).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        );
      }
    }
  });

  it('is opaque and drawn in system colours under forced colours and with transparency off', async () => {
    for (const [emulation, features] of [
      ['forced-colours', [{ name: 'forced-colors', value: 'active' }]],
      ['transparency-off', [{ name: 'prefers-reduced-transparency', value: 'reduce' }]],
    ] as const) {
      await emulate(features);
      for (const [, fileName] of BACKDROPS) {
        await mainWindow.activateTab(fileName);
        await controlWheel.openControlWheel();
        const surface = await controlWheel.surfaceStyle();
        await screenshot(`wheel-${emulation}-${fileName.replace('.md', '')}`);
        await controlWheel.pressInWheel('Escape');
        await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
        expect(surface.backdropFilter, emulation).toBe('none');
        expect(surface.backgroundOpacity, emulation).toBe(1);
      }
      await emulate([]);
    }
  });

  it('opens without a long frame', async () => {
    await devTools.send('Tracing.start', {
      categories:
        'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',
      transferMode: 'ReportEvents',
    });
    const traceEvents: TraceEvent[] = [];
    const stopCollecting = devTools.on('Tracing.dataCollected', (params) => {
      traceEvents.push(...(params as { value: typeof traceEvents }).value);
    });
    await app.browser.execute(() => {
      const seen: PageLongFrame[] = [];
      (globalThis as { wheelLongFrames?: typeof seen }).wheelLongFrames = seen;
      for (const type of ['long-animation-frame', 'longtask']) {
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const frame = entry as PerformanceEntry & {
                renderStart?: number;
                scripts?: { startTime: number; duration: number }[];
              };
              const frameEnd = entry.startTime + entry.duration;
              const renderStart =
                frame.renderStart !== undefined && frame.renderStart > 0 ? frame.renderStart : frameEnd;
              const scriptMs = (frame.scripts ?? [])
                .filter((script) => script.startTime < renderStart)
                .reduce((total, script) => total + script.duration, 0);
              const renderMs = frameEnd - renderStart;
              seen.push({
                type,
                durationMs: entry.duration,
                ownWorkMs: type === 'longtask' ? entry.duration : scriptMs + renderMs,
              });
            }
          }).observe({ type, buffered: false });
        } catch {
          // This WebView2 does not report that entry type.
        }
      }
    });

    await controlWheel.openControlWheel();
    await app.browser.pause(SETTLE_MS);
    const pageLongFrames = await app.browser.execute(
      () => (globalThis as { wheelLongFrames?: PageLongFrame[] }).wheelLongFrames ?? [],
    );
    const pageSlowFrames = pageLongFrames.filter((frame) => frame.ownWorkMs >= LONG_FRAME_MS);
    const longestFrameMs = Math.max(0, ...pageLongFrames.map((frame) => frame.durationMs));
    const longestTimeOutsideOwnWorkMs = Math.max(
      0,
      ...pageLongFrames.map((frame) => frame.durationMs - frame.ownWorkMs),
    );
    const traceEnded = new Promise<void>((resolve) =>
      devTools.on('Tracing.tracingComplete', () => resolve()),
    );
    await devTools.send('Tracing.end');
    await traceEnded;
    stopCollecting();
    writeFileSync(join(PASS_FOLDER, 'wheel-open-trace.json'), JSON.stringify({ traceEvents }));
    const pageTasks = pageMainThreadTasks(traceEvents);
    const longTasks = pageTasks.filter(
      (event) => (event.dur ?? 0) >= LONG_FRAME_MS * MICROSECONDS_PER_MILLISECOND,
    );
    const longestTaskMs = Math.max(
      0,
      ...pageTasks.map((event) => (event.dur ?? 0) / MICROSECONDS_PER_MILLISECOND),
    );
    const taskCount = pageTasks.length;
    record(
      `opening: ${String(pageLongFrames.length)} long frames seen by the page, ${String(pageSlowFrames.length)} of them from its own work, the longest ${longestFrameMs.toFixed(1)} ms with ${longestTimeOutsideOwnWorkMs.toFixed(1)} ms outside its own work; trace has ${String(taskCount)} tasks, of them ${String(longTasks.length)} tasks of ${String(LONG_FRAME_MS)} ms or more, the longest ${longestTaskMs.toFixed(1)} ms`,
    );

    expect(taskCount).toBeGreaterThan(0);
    expect(pageSlowFrames).toEqual([]);
    expect(longestFrameMs).toBeLessThan(OPENING_FRAME_CEILING_MS);
    expect(longTasks).toEqual([]);
  });

  async function focusedAccessibleNode(): Promise<{
    role: string;
    name: string;
    checked?: string;
    expanded?: string;
  }> {
    const { result } = await devTools.send<{ result: { objectId?: string } }>('Runtime.evaluate', {
      expression: 'document.activeElement',
    });
    const { nodes } = await devTools.send<{
      nodes: {
        role?: { value: string };
        name?: { value: string };
        properties?: { name: string; value: { value: unknown } }[];
      }[];
    }>('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false });
    const node = nodes[0];
    const propertyOf = (wanted: string) => {
      const value = node?.properties?.find((property) => property.name === wanted)?.value.value;
      return typeof value === 'string' || typeof value === 'boolean' ? { [wanted]: String(value) } : {};
    };
    return {
      role: node?.role?.value ?? '',
      name: node?.name?.value ?? '',
      ...propertyOf('checked'),
      ...propertyOf('expanded'),
    };
  }

  it('names open, move, choose and the gear the way assistive technology reads them', async () => {
    await controlWheel.openControlWheel();
    const opened = await focusedAccessibleNode();
    await controlWheel.pressInWheel('ArrowDown');
    const moved = await focusedAccessibleNode();
    await controlWheel.pressInWheel('Tab');
    const gear = await focusedAccessibleNode();
    // A key sent by the driver does not press a button, so the gear is clicked, as Enter would do.
    await controlWheel.openKindSettings();
    const gearPopup = await focusedAccessibleNode();
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
    await controlWheel.pressInWheel('Escape');
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    await controlWheel.openControlWheel();
    await controlWheel.pressInWheel('2');
    await mainWindow.waitForNotice('workspaceKinds.notice.shown', { kind: 'Notes' });
    const liveRegion = app.browser.$('//*[@aria-live="polite"][.//*[normalize-space(.)="Showing Notes."]]');

    for (const [step, node] of Object.entries({ opened, moved, gear, gearPopup })) {
      record(`assistive technology at ${step}: ${JSON.stringify(node)}`);
    }
    record('assistive technology on choosing: "Showing Notes." in a polite live region');
    expect(opened).toMatchObject({ role: 'menuitemradio', name: 'Markdown viewer', checked: 'true' });
    expect(moved).toMatchObject({ role: 'menuitemradio', name: 'Notes', checked: 'false' });
    expect(gear).toMatchObject({ role: 'button', name: 'Choose workspace kinds', expanded: 'false' });
    expect(gearPopup).toMatchObject({ role: 'switch', checked: 'true' });
    expect(await liveRegion.isExisting()).toBe(true);
  });

  /** Opens the wheel with the shortcut and reports the longest animation its segments and surface run. */
  async function openAndReadAnimations(): Promise<{
    readonly longestAnimationMs: number;
    readonly animated: number;
  }> {
    return app.browser.execute(
      () =>
        new Promise<{ longestAnimationMs: number; animated: number }>((resolve) => {
          const shortcut = { key: ' ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true };
          document.body.dispatchEvent(new KeyboardEvent('keydown', shortcut));
          requestAnimationFrame(() => {
            const animated = [
              ...document.querySelectorAll('[role="menuitemradio"], [data-testid="wheel-surface"]'),
            ];
            const durations = animated.map((element) => {
              const { animationName, animationDuration, animationDelay } = getComputedStyle(element);
              if (animationName === 'none') return 0;
              return (parseFloat(animationDuration) + parseFloat(animationDelay)) * 1000;
            });
            resolve({ longestAnimationMs: Math.max(0, ...durations), animated: animated.length });
          });
        }),
    );
  }

  it('opens at once and lights in place with reduced motion', async () => {
    await emulate([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

    const { longestAnimationMs, animated } = await openAndReadAnimations();
    await controlWheel.wheel().waitForDisplayed();
    const isReduced = await controlWheel.isMotionReduced();
    await controlWheel.pointAtSegment('Notes');
    const lit = await controlWheel.litSegmentNames();
    record(`reduced motion: the longest opening animation runs ${longestAnimationMs.toFixed(1)} ms`);

    expect(isReduced).toBe(true);
    expect(animated).toBeGreaterThan(0);
    expect(longestAnimationMs).toBe(0);
    expect(lit).toEqual(['Notes']);
    expect(await findAccessibilityViolations(app.browser)).toEqual([]);
  });

  async function closeAndTimeTheNextOpening(): Promise<number> {
    await controlWheel.pressInWheel('Escape');
    await app.browser.waitUntil(async () => !(await controlWheel.isOpen()));
    await app.browser.pause(SETTLE_MS);
    return controlWheel.openMotionMs();
  }

  it('with motion allowed, finishes opening within 200 ms and switches before it has closed', async () => {
    await emulate([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    const { longestAnimationMs } = await openAndReadAnimations();
    await controlWheel.wheel().waitForDisplayed();
    const firstOpeningMs = await closeAndTimeTheNextOpening();
    const openingMs = await closeAndTimeTheNextOpening();
    const { switchedAtMs, removedAtMs } = await controlWheel.chooseSegmentAndTimeTheClose('Notes');
    record(
      `motion allowed: the longest opening animation is set to ${longestAnimationMs.toFixed(1)} ms; measured openings took ${firstOpeningMs.toFixed(1)} ms and ${openingMs.toFixed(1)} ms; choosing switched after ${switchedAtMs.toFixed(1)} ms and the wheel was gone after ${removedAtMs.toFixed(1)} ms`,
    );

    expect(longestAnimationMs).toBeLessThanOrEqual(OPEN_MOTION_BUDGET_MS);
    expect(openingMs).toBeLessThanOrEqual(OPEN_MOTION_BUDGET_MS);
    expect(switchedAtMs).toBeLessThan(removedAtMs);
  });

  it('ignores the shortcut while an input method is composing, and opens once it is done', async () => {
    const sendShortcut = (isComposing: boolean, key: string) =>
      app.browser.execute(
        (composing, pressedKey) => {
          const init = {
            key: pressedKey,
            ctrlKey: true,
            shiftKey: true,
            isComposing: composing,
            bubbles: true,
          };
          document.body.dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }));
        },
        isComposing,
        key,
      );

    await sendShortcut(true, ' ');
    await sendShortcut(false, 'Process');
    await app.browser.pause(SETTLE_MS);
    const isOpenDuringComposition = await controlWheel.isOpen();
    await sendShortcut(false, ' ');
    await controlWheel.wheel().waitForDisplayed();
    record(
      `composition: Ctrl+Shift+Space while composing ${isOpenDuringComposition ? 'opened' : 'left closed'} the wheel`,
    );

    expect(isOpenDuringComposition).toBe(false);
  });
});
