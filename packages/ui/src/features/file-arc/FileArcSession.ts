import {
  addWheelMovement,
  fileArcEntries,
  NO_WHEEL_MOVEMENT,
  startingIndex,
  steppedIndex,
  type FileArcDirection,
  type FileArcEntry,
  type FileArcSource,
  type WheelMovement,
  type WheelSum,
} from '@mdx/core';
import type { DocumentLocation } from '@mdx/platform';

export interface ShownFileArc {
  readonly entries: readonly FileArcEntry[];
  readonly highlighted: number;
}

/** What the arc lists when it opens: the tree as it is now, and the active document. */
export interface FileArcList {
  readonly source: FileArcSource;
  readonly activeKey: string | undefined;
}

/** How the arc closed: it opened an entry, or it kept the active document. */
export type FileArcEnd =
  { readonly kind: 'opened'; readonly entry: FileArcEntry } | { readonly kind: 'kept' };

export interface FileArcSessionEvents {
  readonly onChange: (shown: ShownFileArc | undefined) => void;
  readonly onOpen: (location: DocumentLocation) => void;
  readonly onEnd: (end: FileArcEnd) => void;
  /** The arc did not open because nothing but the active document is listed. */
  readonly onEmpty: () => void;
}

/** One opening of the arc: where it starts, each step, and what letting go or Esc does. */
export class FileArcSession {
  private shownArc: ShownFileArc | undefined;
  private activeKeyWhenOpened: string | undefined;
  private wheelSum: WheelSum = NO_WHEEL_MOVEMENT;

  constructor(private readonly events: FileArcSessionEvents) {}

  get shown(): ShownFileArc | undefined {
    return this.shownArc;
  }

  /** Opens the arc one step from the active document, or moves the open arc one entry. */
  step(direction: FileArcDirection, list: () => FileArcList): void {
    const shown = this.shownArc;
    if (shown) {
      this.show({ ...shown, highlighted: steppedIndex(shown.highlighted, shown.entries.length, direction) });
      return;
    }
    const { source, activeKey } = list();
    const entries = fileArcEntries(source);
    const keys = entries.map((entry) => entry.location.canonicalKey);
    const highlighted = startingIndex(keys, activeKey, direction);
    if (highlighted === undefined) {
      this.events.onEmpty();
      return;
    }
    this.activeKeyWhenOpened = activeKey;
    this.show({ entries, highlighted });
  }

  /** Steps once the wheel has turned far enough; a touchpad's small events add up first. */
  turnWheel(movement: WheelMovement, pageHeightPx: number, list: () => FileArcList): void {
    const { sum, step } = addWheelMovement(this.wheelSum, movement, pageHeightPx);
    this.wheelSum = sum;
    if (step) this.step(step, list);
  }

  /** Forgets wheel movement that did not add up to a step, such as before Ctrl was pressed again. */
  forgetWheelMovement(): void {
    this.wheelSum = NO_WHEEL_MOVEMENT;
  }

  /** Closes the arc and opens the entry, the highlighted one unless another is given. */
  choose(index?: number): void {
    const shown = this.shownArc;
    if (!shown) return;
    const entry = shown.entries[index ?? shown.highlighted];
    this.close();
    if (!entry || entry.location.canonicalKey === this.activeKeyWhenOpened) {
      this.events.onEnd({ kind: 'kept' });
      return;
    }
    this.events.onOpen(entry.location);
    this.events.onEnd({ kind: 'opened', entry });
  }

  cancel(): void {
    if (!this.shownArc) return;
    this.close();
    this.events.onEnd({ kind: 'kept' });
  }

  private close() {
    this.wheelSum = NO_WHEEL_MOVEMENT;
    this.show(undefined);
  }

  private show(shown: ShownFileArc | undefined) {
    this.shownArc = shown;
    this.events.onChange(shown);
  }
}
