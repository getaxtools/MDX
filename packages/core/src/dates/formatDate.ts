/** Longest tokens first, so `MMMM` is not read as two `MM`. */
const DATE_TOKENS = /dddd|MMMM|YYYY|MM|DD|D|HH|mm|ss/g;
const TWO_DIGITS = 2;

/**
 * Formats a date with tokens such as `YYYY-MM-DD` or `dddd D MMMM`; weekday and month names come
 * from the app language, and any other text in the format stays as it is.
 */
export function formatDate(date: Date, format: string, locale: string): string {
  return format.replace(DATE_TOKENS, (token) => tokenValue(token, date, locale));
}

function tokenValue(token: string, date: Date, locale: string): string {
  switch (token) {
    case 'dddd':
      return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    case 'MMMM':
      return new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);
    case 'YYYY':
      return String(date.getFullYear());
    case 'MM':
      return twoDigits(date.getMonth() + 1);
    case 'DD':
      return twoDigits(date.getDate());
    case 'D':
      return String(date.getDate());
    case 'HH':
      return twoDigits(date.getHours());
    case 'mm':
      return twoDigits(date.getMinutes());
    default:
      return twoDigits(date.getSeconds());
  }
}

function twoDigits(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}
