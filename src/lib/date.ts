/**
 * Date helpers around epoch-millisecond timestamps, local timezone.
 * Pure functions — safe for unit tests and reusable on any platform.
 */

/** Epoch ms of local midnight for the day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Epoch ms of the last millisecond of the local day containing `ms`. */
export function endOfDay(ms: number): number {
  return startOfDay(ms) + 24 * 60 * 60 * 1000 - 1;
}

/** Epoch ms shifted by whole calendar days (local timezone). */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** True when both timestamps fall on the same local day. */
export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Weekday index (0 = Sunday) of the local day containing `ms`. */
export function weekdayIndex(ms: number): number {
  return new Date(ms).getDay();
}

/** Short localized day label, e.g. "Oct 20". */
export function formatDayShort(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(ms),
  );
}
