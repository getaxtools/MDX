const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = '-';
const ACE_PREFIX = 'xn--';
const DIGIT_ZERO = 0x30;
const LETTER_A = 0x61;
const DIGIT_VALUE_OFFSET = 26;
const MAX_CODE_POINT = 0x10ffff;
const DECIMAL_DIGITS = 10;

function digitValueOf(character: string): number | undefined {
  const code = character.toLowerCase().charCodeAt(0);
  if (code >= LETTER_A && code < LETTER_A + DIGIT_VALUE_OFFSET) return code - LETTER_A;
  if (code >= DIGIT_ZERO && code < DIGIT_ZERO + DECIMAL_DIGITS) return code - DIGIT_ZERO + DIGIT_VALUE_OFFSET;
  return undefined;
}

function adaptBias(delta: number, pointCount: number, isFirstTime: boolean): number {
  let scaled = isFirstTime ? Math.floor(delta / DAMP) : delta >> 1;
  scaled += Math.floor(scaled / pointCount);
  let bias = 0;
  while (scaled > ((BASE - T_MIN) * T_MAX) >> 1) {
    scaled = Math.floor(scaled / (BASE - T_MIN));
    bias += BASE;
  }
  return bias + Math.floor(((BASE - T_MIN + 1) * scaled) / (scaled + SKEW));
}

function thresholdAt(position: number, bias: number): number {
  if (position <= bias) return T_MIN;
  return position >= bias + T_MAX ? T_MAX : position - bias;
}

/** Reads one generalized variable-length integer; returns the new delta and where reading stopped. */
function readDelta(encoded: string, start: number, { delta, bias }: { delta: number; bias: number }) {
  let value = delta;
  let weight = 1;
  for (let index = start, position = BASE; index < encoded.length; position += BASE) {
    const digit = digitValueOf(encoded.charAt(index));
    index += 1;
    if (digit === undefined) return undefined;
    value += digit * weight;
    const threshold = thresholdAt(position, bias);
    if (digit < threshold) return { delta: value, next: index };
    weight *= BASE - threshold;
  }
  return undefined;
}

/**
 * Decodes one `xn--` host label (RFC 3492) to Unicode, so a look-alike written in its ASCII form can still
 * be checked; returns undefined for anything that is not valid Punycode.
 */
export function decodePunycodeLabel(label: string): string | undefined {
  if (!label.toLowerCase().startsWith(ACE_PREFIX)) return undefined;
  const encoded = label.slice(ACE_PREFIX.length);
  const delimiterIndex = encoded.lastIndexOf(DELIMITER);
  const output = Array.from(
    delimiterIndex > 0 ? encoded.slice(0, delimiterIndex) : '',
    (c) => c.codePointAt(0) ?? 0,
  );
  let codePoint = INITIAL_N;
  let bias = INITIAL_BIAS;
  let delta = 0;
  let index = delimiterIndex > 0 ? delimiterIndex + 1 : 0;
  while (index < encoded.length) {
    const read = readDelta(encoded, index, { delta, bias });
    if (!read) return undefined;
    const pointCount = output.length + 1;
    bias = adaptBias(read.delta - delta, pointCount, delta === 0);
    codePoint += Math.floor(read.delta / pointCount);
    if (codePoint > MAX_CODE_POINT) return undefined;
    output.splice(read.delta % pointCount, 0, codePoint);
    delta = (read.delta % pointCount) + 1;
    index = read.next;
  }
  return String.fromCodePoint(...output);
}
