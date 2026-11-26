export type Rgb = readonly [number, number, number];

const CHANNEL_MAX = 255;

export const BLACK: Rgb = [0, 0, 0];
export const WHITE: Rgb = [CHANNEL_MAX, CHANNEL_MAX, CHANNEL_MAX];

// The sRGB transfer curve and luminance weights from the WCAG 2 definition of relative luminance.
const LINEAR_SEGMENT_LIMIT = 0.03928;
const LINEAR_SEGMENT_SLOPE = 12.92;
const CURVE_OFFSET = 0.055;
const CURVE_EXPONENT = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const FLARE = 0.05;

export function rgbOf(hex: string): Rgb {
  const digits = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!digits) throw new Error(`not a hex colour: ${hex}`);
  return [
    Number.parseInt(digits[1] ?? '', 16),
    Number.parseInt(digits[2] ?? '', 16),
    Number.parseInt(digits[3] ?? '', 16),
  ];
}

/** The colour seen when `colour` at `opacity` (0 to 1) is drawn over `backdrop`. */
export function laidOver(colour: Rgb, opacity: number, backdrop: Rgb): Rgb {
  const mixed = (channel: 0 | 1 | 2) => colour[channel] * opacity + backdrop[channel] * (1 - opacity);
  return [mixed(0), mixed(1), mixed(2)];
}

function linearChannel(channel: number): number {
  const value = channel / CHANNEL_MAX;
  if (value <= LINEAR_SEGMENT_LIMIT) return value / LINEAR_SEGMENT_SLOPE;
  return ((value + CURVE_OFFSET) / (1 + CURVE_OFFSET)) ** CURVE_EXPONENT;
}

function relativeLuminance([red, green, blue]: Rgb): number {
  return (
    RED_WEIGHT * linearChannel(red) + GREEN_WEIGHT * linearChannel(green) + BLUE_WEIGHT * linearChannel(blue)
  );
}

/** The WCAG contrast ratio of two opaque colours, from 1 to 21. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter = 0, darker = 0] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + FLARE) / (darker + FLARE);
}
