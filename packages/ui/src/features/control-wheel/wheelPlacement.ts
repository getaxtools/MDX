import type { WheelDock } from '@mdx/core';

export const WHEEL_DIAMETER_REM = 12.5;
export const MIN_WHEEL_DIAMETER_PX = 160;
export const WHEEL_EDGE_MARGIN_PX = 16;

export interface WheelPlacementRequest {
  readonly dock: WheelDock;
  readonly direction: 1 | -1;
  readonly windowWidthPx: number;
  readonly windowHeightPx: number;
  readonly rootFontSizePx: number;
  /** Space kept free under the wheel, such as the status bar. */
  readonly bottomInsetPx: number;
  /** Space kept free above the wheel for its caption. */
  readonly captionHeightPx: number;
  readonly pointer?: { readonly x: number; readonly y: number } | undefined;
}

export interface WheelPlacement {
  readonly centerX: number;
  readonly centerY: number;
  readonly diameterPx: number;
}

/** Where the wheel opens: its dock corner, or the pointer when known, always fully inside the window. */
export function wheelPlacement(request: WheelPlacementRequest): WheelPlacement {
  const diameterPx = wheelDiameter(request);
  const radius = diameterPx / 2;
  const minX = WHEEL_EDGE_MARGIN_PX + radius;
  const maxX = request.windowWidthPx - WHEEL_EDGE_MARGIN_PX - radius;
  const minY = WHEEL_EDGE_MARGIN_PX + request.captionHeightPx + radius;
  const maxY = request.windowHeightPx - WHEEL_EDGE_MARGIN_PX - request.bottomInsetPx - radius;
  if (request.pointer) {
    return {
      centerX: clamp(request.pointer.x, minX, maxX),
      centerY: clamp(request.pointer.y, minY, maxY),
      diameterPx,
    };
  }
  const isRightCorner = (request.dock === 'bottomInlineEnd') === (request.direction === 1);
  return { centerX: isRightCorner ? maxX : minX, centerY: Math.max(maxY, minY), diameterPx };
}

function wheelDiameter(request: WheelPlacementRequest): number {
  const preferred = Math.max(WHEEL_DIAMETER_REM * request.rootFontSizePx, MIN_WHEEL_DIAMETER_PX);
  const availableWidth = request.windowWidthPx - 2 * WHEEL_EDGE_MARGIN_PX;
  const availableHeight =
    request.windowHeightPx - 2 * WHEEL_EDGE_MARGIN_PX - request.bottomInsetPx - request.captionHeightPx;
  return Math.max(Math.min(preferred, availableWidth, availableHeight), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
