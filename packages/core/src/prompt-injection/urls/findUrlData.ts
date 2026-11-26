export interface UrlDataLimits {
  /** A query or path value longer than this carries data. */
  readonly maxValueLength: number;
  /** Base64-looking values at least this long carry data; 0 turns the check off. */
  readonly minEncodedLength: number;
  /** Hexadecimal values at least this long carry data; 0 turns the check off. */
  readonly minHexLength: number;
  /** Values of parameters named like `q` or `data` at least this long carry data; 0 turns the check off. */
  readonly minDataValueLength: number;
  readonly dataParameterNames: readonly string[];
  readonly trackingParameterPrefixes: readonly string[];
}

export interface UrlData {
  /** A template slot such as `{chat_history}` or `$SECRET` that an assistant fills in. */
  readonly hasPlaceholder: boolean;
  readonly hasData: boolean;
}

const PLACEHOLDERS = [
  /\{[^{}]{1,64}\}/,
  /\[[A-Z][A-Z_]{1,31}\]/,
  /\$[A-Z_][A-Z0-9_]{1,31}/,
  /\$\{[^{}]{1,64}\}/,
  /<[a-z_]{2,32}>/i,
  /%s/,
];
const BASE64_LIKE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const HEXADECIMAL = /^[0-9a-f]+$/i;
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /[0-9]/;

function safelyDecoded(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll('+', ' '));
  } catch {
    return text;
  }
}

function looksEncoded(value: string, limits: UrlDataLimits): boolean {
  const isLongHex = limits.minHexLength > 0 && value.length >= limits.minHexLength && HEXADECIMAL.test(value);
  const isLongBase64 =
    limits.minEncodedLength > 0 &&
    value.length >= limits.minEncodedLength &&
    BASE64_LIKE.test(value) &&
    HAS_UPPER.test(value) &&
    HAS_LOWER.test(value) &&
    HAS_DIGIT.test(value);
  return isLongHex || isLongBase64;
}

function isDataParameter(name: string, value: string, limits: UrlDataLimits): boolean {
  return (
    limits.minDataValueLength > 0 &&
    value.length >= limits.minDataValueLength &&
    limits.dataParameterNames.includes(name.toLowerCase())
  );
}

function queryCarriesData(url: URL, limits: UrlDataLimits): boolean {
  return [...url.searchParams].some(([name, value]) => {
    if (limits.trackingParameterPrefixes.some((prefix) => name.toLowerCase().startsWith(prefix)))
      return false;
    return (
      value.length > limits.maxValueLength ||
      looksEncoded(value, limits) ||
      isDataParameter(name, value, limits)
    );
  });
}

/** Whether an address carries data to its host: template slots, long values, encoded values or data parameters. */
export function findUrlData(url: URL, limits: UrlDataLimits): UrlData {
  const written = `${url.pathname}${url.search}${url.hash}`;
  const hasPlaceholder = PLACEHOLDERS.some((placeholder) => placeholder.test(safelyDecoded(written)));
  const hasLongPathSegment = url.pathname
    .split('/')
    .some((segment) => segment.length > limits.maxValueLength);
  return { hasPlaceholder, hasData: hasPlaceholder || hasLongPathSegment || queryCarriesData(url, limits) };
}
