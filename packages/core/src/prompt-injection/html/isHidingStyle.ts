export interface HidingStyleThresholds {
  readonly minFontSizePx: number;
  readonly offScreenOffsetPx: number;
}

const LENGTH = /^(-?\d*\.?\d+)(px|pt|em|rem|%)?$/;
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;
const PIXELS_PER_POINT = CSS_PIXELS_PER_INCH / POINTS_PER_INCH;
const PIXELS_PER_EM = 16;
const PIXELS_PER_FONT_PERCENT = 0.16;
const PIXELS_PER_UNIT: Readonly<Record<string, number>> = {
  px: 1,
  pt: PIXELS_PER_POINT,
  em: PIXELS_PER_EM,
  rem: PIXELS_PER_EM,
  '%': PIXELS_PER_FONT_PERCENT,
};
const SHORT_HEX_COLOR = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/;
const ZERO_ALPHA = /^(rgba|hsla)\(.*,\s*0(\.0*)?\)$|^(rgb|hsl)\(.*\/\s*0(\.0*)?%?\)$/;
const NAMED_COLORS: Readonly<Record<string, string>> = { white: '#ffffff', black: '#000000' };
const SIZE_PROPERTIES = ['width', 'height', 'max-width', 'max-height'];
const OFFSET_PROPERTIES = ['left', 'top', 'right', 'bottom'];
const CLIP_RECT = /rect\(([^)]*)\)/;
const MIN_VISIBLE_CLIP_PX = 1;
const HIDING_CLIP_PATH = /inset\(\s*(5\d|[6-9]\d|100)%|circle\(\s*0/;
const SCALED_TO_ZERO = /scale\(\s*0(\.0*)?\s*[,)]/;
const IMPORTANT = /\s*!important$/;

type Declarations = ReadonlyMap<string, string>;

function declarationsOf(style: string): Declarations {
  const declarations = new Map<string, string>();
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .trim()
      .toLowerCase()
      .replace(IMPORTANT, '');
    declarations.set(property, value);
  }
  return declarations;
}

/** The length in pixels, assuming a 16 pixel font; undefined for anything that is not a plain length. */
export function pixelsOf(value: string | undefined): number | undefined {
  const match = LENGTH.exec(value ?? '');
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1] ?? '');
  return amount * (PIXELS_PER_UNIT[match[2] ?? 'px'] ?? 1);
}

/** Lower case, without spaces, with #abc written as #aabbcc and white and black as hex. */
export function normalizeColor(color: string): string {
  const compact = color.trim().toLowerCase().replaceAll(/\s+/g, '');
  const named = NAMED_COLORS[compact];
  if (named) return named;
  const short = SHORT_HEX_COLOR.exec(compact);
  return short
    ? `#${short
        .slice(1)
        .map((digit) => digit.repeat(2))
        .join('')}`
    : compact;
}

function isZero(value: string | undefined): boolean {
  return pixelsOf(value) === 0;
}

function hasNoBox(declarations: Declarations): boolean {
  const overflow = declarations.get('overflow');
  const isOverflowClipped = overflow === 'hidden' || overflow === 'clip';
  return isOverflowClipped && SIZE_PROPERTIES.some((property) => isZero(declarations.get(property)));
}

function isOffScreen(declarations: Declarations, offScreenOffsetPx: number): boolean {
  const isFarAway = (value: string | undefined) => (pixelsOf(value) ?? 0) <= -offScreenOffsetPx;
  const position = declarations.get('position');
  const isPositioned = position === 'absolute' || position === 'fixed';
  const isPlacedAway =
    isPositioned && OFFSET_PROPERTIES.some((property) => isFarAway(declarations.get(property)));
  return isPlacedAway || isFarAway(declarations.get('text-indent'));
}

function isClippedAway(declarations: Declarations): boolean {
  const rectangle = CLIP_RECT.exec(declarations.get('clip') ?? '')?.[1];
  const isTinyRectangle = rectangle
    ?.split(/[\s,]+/)
    .filter(Boolean)
    .every((edge) => Math.abs(pixelsOf(edge) ?? Infinity) <= MIN_VISIBLE_CLIP_PX);
  return isTinyRectangle === true || HIDING_CLIP_PATH.test(declarations.get('clip-path') ?? '');
}

function hasInvisibleColor(declarations: Declarations): boolean {
  const color = declarations.get('color');
  if (color === undefined) return false;
  if (color === 'transparent' || ZERO_ALPHA.test(color)) return true;
  const background = declarations.get('background-color') ?? declarations.get('background');
  return background !== undefined && normalizeColor(background) === normalizeColor(color);
}

function hasTinyFont(declarations: Declarations, minFontSizePx: number): boolean {
  const fontSize = pixelsOf(declarations.get('font-size'));
  return fontSize !== undefined && fontSize < minFontSizePx;
}

/** Whether inline CSS makes an element's text invisible, by any of the tricks used to hide text from readers. */
function isNotRendered(declarations: Declarations): boolean {
  const visibility = declarations.get('visibility');
  return (
    declarations.get('display') === 'none' ||
    visibility === 'hidden' ||
    visibility === 'collapse' ||
    isZero(declarations.get('opacity')) ||
    SCALED_TO_ZERO.test(declarations.get('transform') ?? '')
  );
}

export function isHidingStyle(style: string, thresholds: HidingStyleThresholds): boolean {
  const declarations = declarationsOf(style);
  return (
    isNotRendered(declarations) ||
    hasTinyFont(declarations, thresholds.minFontSizePx) ||
    hasNoBox(declarations) ||
    isOffScreen(declarations, thresholds.offScreenOffsetPx) ||
    isClippedAway(declarations) ||
    hasInvisibleColor(declarations)
  );
}
