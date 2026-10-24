/**
 * Time-of-day helpers on the 15-minute grid. Pure functions, no imports —
 * safe for unit tests and reusable on any platform.
 */

export const MINUTES_PER_DAY = 24 * 60;
export const DEFAULT_TIME_STEP = 5;

/** Formats minutes since midnight as 24-hour "HH:MM". 570 -> "09:30", 1440 -> "00:00". */
export function minutesToHHMM(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new RangeError(`minutes out of range [0, ${MINUTES_PER_DAY}]: ${minutes}`);
  }
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parses "HH:MM" (24-hour) into minutes since midnight. "09:30" -> 570. */
export function hhmmToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`invalid time string: "${value}"`);
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) {
    throw new Error(`time out of range: "${value}"`);
  }
  return (h % 24) * 60 + m;
}

/** Rounds minutes to the nearest grid step (default 15 min). */
export function roundToStep(minutes: number, step: number = DEFAULT_TIME_STEP): number {
  if (step <= 0) {
    throw new RangeError(`step must be positive: ${step}`);
  }
  return Math.round(minutes / step) * step;
}

/** Human-readable duration: 90 -> "1 h 30 min", 60 -> "1 h", 45 -> "45 min", 0 -> "0 min". */
export function formatDuration(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`minutes must be a non-negative integer: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}
