import { describe, expect, it } from 'vitest';
import { equationDialogPlacement } from './equationPlacement';

const WINDOW = { width: 1000, height: 800 };
const DIALOG = { width: 400, height: 300 };

describe('equation dialog placement', () => {
  it('goes below the edited lines when it fits there', () => {
    const placement = equationDialogPlacement({ top: 100, bottom: 124, left: 50 }, DIALOG, WINDOW);

    expect(placement).toEqual({ top: 132, left: 50 });
  });

  it('goes above the edited lines near the bottom of the window', () => {
    const placement = equationDialogPlacement({ top: 600, bottom: 624, left: 50 }, DIALOG, WINDOW);

    expect(placement.top + DIALOG.height).toBeLessThanOrEqual(600);
  });

  it('stays inside the window on the right', () => {
    const placement = equationDialogPlacement({ top: 100, bottom: 124, left: 900 }, DIALOG, WINDOW);

    expect(placement.left).toBe(WINDOW.width - DIALOG.width - 8);
  });

  it('takes the side with more room when it fits on neither', () => {
    const tall = { width: 400, height: 500 };

    const placement = equationDialogPlacement({ top: 300, bottom: 340, left: 0 }, tall, WINDOW);

    expect(placement.top).toBe(WINDOW.height - tall.height - 8);
  });

  it('sits a third of the way down without edited lines', () => {
    expect(equationDialogPlacement(undefined, DIALOG, WINDOW)).toEqual({ top: 500 / 3, left: 300 });
  });
});
