/** The card leaves the time out rather than wait longer than this for it. */
export const LAST_EDITED_READ_LIMIT_MS = 150;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;

/** Reads a file's last modified time, in milliseconds since 1970; undefined when it is not known. */
export type LastEditedReader = (path: string) => Promise<number | undefined>;

/**
 * The file's last edited time, or undefined when the read fails or takes longer than the limit,
 * so a slow share never holds up the card.
 */
export async function readLastEdited(
  read: LastEditedReader,
  path: string,
  limitMs: number = LAST_EDITED_READ_LIMIT_MS,
): Promise<number | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooSlow = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), limitMs);
  });
  try {
    return await Promise.race([read(path).catch(() => undefined), tooSlow]);
  } finally {
    clearTimeout(timer);
  }
}

/** `yesterday`, `3 hours ago`, `in 2 days` in the app language. */
export function relativeTimeText(editedAtMs: number, nowMs: number, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const days = calendarDaysBetween(nowMs, editedAtMs);
  if (days === 0) {
    const minutes = Math.round((editedAtMs - nowMs) / MS_PER_MINUTE);
    if (Math.abs(minutes) < MINUTES_PER_HOUR) return format.format(minutes, 'minute');
    return format.format(Math.round(minutes / MINUTES_PER_HOUR), 'hour');
  }
  if (Math.abs(days) < DAYS_PER_MONTH) return format.format(days, 'day');
  const months = Math.round(days / DAYS_PER_MONTH);
  if (Math.abs(months) < MONTHS_PER_YEAR) return format.format(months, 'month');
  return format.format(Math.round(months / MONTHS_PER_YEAR), 'year');
}

/** Whole local days, so a file edited yesterday evening is `yesterday` this morning. */
function calendarDaysBetween(fromMs: number, toMs: number): number {
  const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  return Math.round(
    (startOfDay(toMs) - startOfDay(fromMs)) / (MS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY),
  );
}
