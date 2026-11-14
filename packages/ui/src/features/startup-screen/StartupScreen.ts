import type { MessageKey, Translator } from '@mdx/i18n';
import { STARTUP_TIPS, firstStartupTipIndex, startupTipText } from './startupTips';

export type StartupStage = 'loadingInterface' | 'restoringDocuments';

/** What the start-up code reports while the app loads. */
export interface StartupProgress {
  showStage(stage: StartupStage): void;
  finish(): void;
  showFailure(): void;
}

export interface StartupScreenOptions {
  readonly document: Document;
  readonly translator: Translator;
  /** Time since the page began to load, which is when the screen's fade-in delay began. */
  readonly elapsedMs?: () => number;
  readonly randomFraction?: () => number;
}

interface StartupScreenParts {
  readonly progress: HTMLElement;
  readonly status: HTMLElement;
  readonly tip: HTMLElement;
  readonly tipTitle: HTMLElement;
  readonly tipText: HTMLElement;
}

export const STARTUP_SCREEN_ELEMENT_ID = 'startup-screen';
/** Matches the fade-in delay in the start-up stylesheet: a start this fast never shows the screen. */
export const STARTUP_SCREEN_APPEAR_DELAY_MS = 400;
export const STARTUP_TIP_ROTATION_INTERVAL_MS = 6000;
export const STARTUP_SCREEN_READY_HOLD_MS = 160;
export const STARTUP_SCREEN_LEAVE_DURATION_MS = 200;

const STAGE_MESSAGE_KEYS: Readonly<Record<StartupStage, MessageKey>> = {
  loadingInterface: 'startup.stage.loadingInterface',
  restoringDocuments: 'startup.stage.restoringDocuments',
};

const NO_STARTUP_SCREEN: StartupProgress = {
  showStage: () => undefined,
  finish: () => undefined,
  showFailure: () => undefined,
};

/** Drives the start-up screen that `index.html` paints before any script runs. */
export class StartupScreen implements StartupProgress {
  private tipRotation: ReturnType<typeof setInterval> | undefined;
  private nextTipIndex: number;
  private isDone = false;

  private constructor(
    private readonly root: HTMLElement,
    private readonly parts: StartupScreenParts,
    private readonly options: StartupScreenOptions,
  ) {
    this.nextTipIndex = firstStartupTipIndex((options.randomFraction ?? Math.random)());
    parts.progress.setAttribute('aria-label', this.translate('startup.screen.label'));
    parts.tipTitle.textContent = this.translate('startup.tip.title');
  }

  /** The screen in the page, or one that does nothing when the page has none. */
  static attach(options: StartupScreenOptions): StartupProgress {
    const root = options.document.getElementById(STARTUP_SCREEN_ELEMENT_ID);
    const parts = root ? partsOf(root) : undefined;
    return root && parts ? new StartupScreen(root, parts, options) : NO_STARTUP_SCREEN;
  }

  showStage(stage: StartupStage): void {
    if (this.isDone) return;
    this.root.dataset.stage = stage;
    this.showStatus(this.translate(STAGE_MESSAGE_KEYS[stage]));
    this.startTipRotation();
  }

  finish(): void {
    if (this.isDone) return;
    this.stop();
    if (this.elapsedMs() < STARTUP_SCREEN_APPEAR_DELAY_MS) {
      this.root.remove();
      return;
    }
    this.root.dataset.stage = 'ready';
    setTimeout(() => {
      this.root.dataset.leaving = 'true';
      setTimeout(() => this.root.remove(), STARTUP_SCREEN_LEAVE_DURATION_MS);
    }, STARTUP_SCREEN_READY_HOLD_MS);
  }

  showFailure(): void {
    if (this.isDone) return;
    this.stop();
    this.root.dataset.stage = 'failed';
    this.parts.status.setAttribute('role', 'alert');
    this.showStatus(this.translate('startup.failed'));
    this.parts.tip.hidden = true;
  }

  private showStatus(text: string): void {
    this.parts.status.textContent = text;
    this.parts.progress.setAttribute('aria-valuetext', text);
  }

  private startTipRotation(): void {
    if (this.tipRotation !== undefined) return;
    this.showNextTip();
    this.tipRotation = setInterval(() => this.showNextTip(), STARTUP_TIP_ROTATION_INTERVAL_MS);
  }

  private showNextTip(): void {
    const tipIndex = this.nextTipIndex % STARTUP_TIPS.length;
    const tip = STARTUP_TIPS[tipIndex];
    if (!tip) return;
    this.parts.tipText.textContent = startupTipText(tip, this.options.translator);
    // Two names for the same fade, so the animation restarts on every new tip.
    this.parts.tipText.dataset.tipParity = this.nextTipIndex % 2 === 0 ? 'even' : 'odd';
    this.parts.tip.hidden = false;
    this.nextTipIndex += 1;
  }

  private stop(): void {
    this.isDone = true;
    clearInterval(this.tipRotation);
  }

  private elapsedMs(): number {
    return (this.options.elapsedMs ?? (() => performance.now()))();
  }

  private translate(key: MessageKey): string {
    return this.options.translator.translate(key);
  }
}

function partsOf(root: HTMLElement): StartupScreenParts | undefined {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-startup-part="${name}"]`);
  const [progress, status, tip, tipTitle, tipText] = [
    'progress',
    'status',
    'tip',
    'tip-title',
    'tip-text',
  ].map(part);
  if (!progress || !status || !tip || !tipTitle || !tipText) return undefined;
  return { progress, status, tip, tipTitle, tipText };
}
