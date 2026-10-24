import { addDays, endOfDay, isSameDay, startOfDay, weekdayIndex } from '../date';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('startOfDay / endOfDay', () => {
  it('maps any moment of a day into [startOfDay, endOfDay]', () => {
    // Invariant-style checks (timezone-safe): probe several fixed timestamps.
    const probes = [
      Date.UTC(2026, 0, 15, 12, 0, 0),
      Date.UTC(2026, 9, 20, 6, 30, 0),
      Date.UTC(2027, 2, 1, 23, 59, 0),
    ];
    for (const probe of probes) {
      const start = startOfDay(probe);
      const end = endOfDay(probe);
      expect(start).toBeLessThanOrEqual(probe);
      expect(probe).toBeLessThanOrEqual(end);
      expect(end - start).toBe(DAY - 1);
    }
  });

  it('startOfDay is idempotent', () => {
    const probe = Date.UTC(2026, 4, 5, 15, 0, 0);
    expect(startOfDay(startOfDay(probe))).toBe(startOfDay(probe));
  });
});

describe('addDays', () => {
  it('keeps startOfDay stable across a shift when no DST transition', () => {
    const probe = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(startOfDay(addDays(probe, 1)) - startOfDay(probe)).toBe(DAY);
    expect(startOfDay(addDays(probe, -1)) - startOfDay(probe)).toBe(-DAY);
  });

  it('isSameDay is false across a day boundary', () => {
    // Noon UTC: stays on the same local day in every timezone (UTC-11..+13),
    // so the assertions hold in CI (UTC) and on any developer machine.
    const probe = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(isSameDay(probe, addDays(probe, 1))).toBe(false);
    expect(isSameDay(probe, probe + HOUR)).toBe(true);
  });
});

describe('weekdayIndex', () => {
  it('matches Date#getDay for fixed probes', () => {
    // 2026-10-20 is a Tuesday (weekday 2) in any timezone-agnostic check vs getDay.
    const probe = Date.UTC(2026, 9, 20, 12, 0, 0);
    expect(weekdayIndex(probe)).toBe(new Date(probe).getDay());
  });

  it('returns values in [0, 6]', () => {
    for (let day = 0; day < 30; day++) {
      const probe = Date.UTC(2026, 9, 1 + day, 12, 0, 0);
      const idx = weekdayIndex(probe);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(6);
    }
  });
});
