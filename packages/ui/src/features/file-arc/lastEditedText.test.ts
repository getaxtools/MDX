import { describe, expect, it, vi } from 'vitest';
import { readLastEdited, relativeTimeText } from './lastEditedText';

const NOW = new Date(2026, 10, 16, 10, 0).getTime();
const HOUR_MS = 3_600_000;

describe('last edited', () => {
  it('the card shows edited yesterday', async () => {
    const editedAt = new Date(2026, 10, 15, 16, 30).getTime();

    const read = await readLastEdited(() => Promise.resolve(editedAt), 'C:\\Docs\\install.md');

    expect(read).toBe(editedAt);
    expect(relativeTimeText(editedAt, NOW, 'en')).toBe('yesterday');
  });

  it('says minutes, hours, days, months and years in the app language', () => {
    expect(relativeTimeText(NOW - 5 * 60_000, NOW, 'en')).toBe('5 minutes ago');
    expect(relativeTimeText(NOW - 3 * HOUR_MS, NOW, 'en')).toBe('3 hours ago');
    expect(relativeTimeText(NOW - 5 * 24 * HOUR_MS, NOW, 'en')).toBe('5 days ago');
    expect(relativeTimeText(NOW - 90 * 24 * HOUR_MS, NOW, 'en')).toBe('3 months ago');
    expect(relativeTimeText(NOW - 800 * 24 * HOUR_MS, NOW, 'en')).toBe('2 years ago');
  });

  it('a failed or slow read leaves the time out', async () => {
    vi.useFakeTimers();
    const failed = readLastEdited(() => Promise.reject(new Error('unreachable')), 'X:\\a.md');
    const slow = readLastEdited(() => new Promise(() => undefined), 'X:\\b.md');

    await vi.advanceTimersByTimeAsync(151);

    expect(await failed).toBeUndefined();
    expect(await slow).toBeUndefined();
    vi.useRealTimers();
  });
});
