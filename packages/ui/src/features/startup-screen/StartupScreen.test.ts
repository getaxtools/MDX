import { createTranslator } from '@mdx/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STARTUP_SCREEN_APPEAR_DELAY_MS,
  STARTUP_SCREEN_LEAVE_DURATION_MS,
  STARTUP_SCREEN_READY_HOLD_MS,
  STARTUP_TIP_ROTATION_INTERVAL_MS,
  StartupScreen,
  type StartupScreenOptions,
} from './StartupScreen';
import { STARTUP_TIPS, startupTipText } from './startupTips';

const translator = createTranslator();
const SLOW_START_MS = 2000;

function paintStartupScreen(): void {
  document.body.innerHTML = `
    <div id="startup-screen" data-stage="starting">
      <div role="progressbar" data-startup-part="progress"></div>
      <p role="status" data-startup-part="status"></p>
      <section data-startup-part="tip" hidden>
        <h2 data-startup-part="tip-title"></h2>
        <p data-startup-part="tip-text"></p>
      </section>
    </div>`;
}

function attachScreen(options: Partial<StartupScreenOptions> = {}) {
  return StartupScreen.attach({
    document,
    translator,
    elapsedMs: () => SLOW_START_MS,
    randomFraction: () => 0,
    ...options,
  });
}

const screenElement = () => document.getElementById('startup-screen');
const statusText = () => document.querySelector('[role="status"], [role="alert"]')?.textContent;
const tipText = () => document.querySelector('[data-startup-part="tip-text"]')?.textContent;

function expectedTipText(index: number): string {
  const tip = STARTUP_TIPS[index];
  if (!tip) throw new Error(`There is no tip ${String(index)}`);
  return startupTipText(tip, translator);
}

describe('StartupScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    paintStartupScreen();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the progress bar and the tip heading in the display language', () => {
    attachScreen();

    expect(document.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Starting MDX');
    expect(document.querySelector('h2')?.textContent).toBe('Tip');
  });

  it('tells what it is loading in the status and the progress value', () => {
    const screen = attachScreen();

    screen.showStage('restoringDocuments');

    expect(statusText()).toBe('Restoring your documents…');
    expect(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe(
      'Restoring your documents…',
    );
    expect(screenElement()?.dataset.stage).toBe('restoringDocuments');
  });

  it('shows a tip and moves to the next one every few seconds', () => {
    const screen = attachScreen();

    screen.showStage('loadingInterface');
    expect(tipText()).toBe(expectedTipText(0));
    vi.advanceTimersByTime(STARTUP_TIP_ROTATION_INTERVAL_MS);

    expect(tipText()).toBe(expectedTipText(1));
    expect(document.querySelector('section')?.hidden).toBe(false);
  });

  it('keeps one tip rotation when the stage changes', () => {
    const screen = attachScreen();
    screen.showStage('loadingInterface');

    screen.showStage('restoringDocuments');
    vi.advanceTimersByTime(STARTUP_TIP_ROTATION_INTERVAL_MS);

    expect(tipText()).toBe(expectedTipText(1));
  });

  it('goes away at once when the app is ready before the screen fades in', () => {
    const screen = attachScreen({ elapsedMs: () => STARTUP_SCREEN_APPEAR_DELAY_MS - 1 });

    screen.finish();

    expect(screenElement()).toBeNull();
  });

  it('fills the bar, fades out and goes away when the app is ready later', () => {
    const screen = attachScreen();
    screen.showStage('restoringDocuments');

    screen.finish();
    expect(screenElement()?.dataset.stage).toBe('ready');
    vi.advanceTimersByTime(STARTUP_SCREEN_READY_HOLD_MS);
    expect(screenElement()?.dataset.leaving).toBe('true');
    vi.advanceTimersByTime(STARTUP_SCREEN_LEAVE_DURATION_MS);

    expect(screenElement()).toBeNull();
  });

  it('reports a failed start as an alert and stops the tips', () => {
    const screen = attachScreen();
    screen.showStage('loadingInterface');

    screen.showFailure();
    vi.advanceTimersByTime(STARTUP_TIP_ROTATION_INTERVAL_MS);

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'MDX could not start. Close this window and open MDX again.',
    );
    expect(screenElement()?.dataset.stage).toBe('failed');
    expect(document.querySelector('section')?.hidden).toBe(true);
  });

  it('ignores a failure reported after the app is ready', () => {
    const screen = attachScreen();
    screen.finish();

    screen.showFailure();

    expect(screenElement()?.dataset.stage).toBe('ready');
  });

  it('does nothing on a page without the screen', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const screen = attachScreen();

    screen.showStage('loadingInterface');
    screen.showFailure();
    screen.finish();

    expect(document.body.innerHTML).toBe('<div id="app"></div>');
  });
});
