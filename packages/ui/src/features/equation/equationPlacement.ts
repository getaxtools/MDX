import type { EditedLinesBox } from '@mdx/editor';

export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

export interface DialogPlacement {
  readonly top: number;
  readonly left: number;
}

/** Room between the edited lines and the dialog, and between the dialog and the window's edges. */
const GAP_PX = 8;
/** Without edited lines to avoid, the dialog sits a third of the way down. */
const TOP_FRACTION_WITHOUT_LINES = 3;

function clamp(value: number, smallest: number, largest: number): number {
  return Math.min(Math.max(value, smallest), Math.max(smallest, largest));
}

/**
 * Below the edited lines when the dialog fits there, else above them; when it fits on neither side,
 * on the side with more room, kept inside the window.
 */
export function equationDialogPlacement(
  lines: EditedLinesBox | undefined,
  dialog: BoxSize,
  window: BoxSize,
): DialogPlacement {
  const lowestTop = window.height - dialog.height - GAP_PX;
  const rightmostLeft = window.width - dialog.width - GAP_PX;
  if (!lines) {
    return {
      top: clamp((window.height - dialog.height) / TOP_FRACTION_WITHOUT_LINES, GAP_PX, lowestTop),
      left: clamp((window.width - dialog.width) / 2, GAP_PX, rightmostLeft),
    };
  }
  const left = clamp(lines.left, GAP_PX, rightmostLeft);
  const below = lines.bottom + GAP_PX;
  const above = lines.top - GAP_PX - dialog.height;
  if (below <= lowestTop) return { top: below, left };
  if (above >= GAP_PX) return { top: above, left };
  const isMoreRoomBelow = window.height - lines.bottom > lines.top;
  return { top: clamp(isMoreRoomBelow ? below : above, GAP_PX, lowestTop), left };
}
