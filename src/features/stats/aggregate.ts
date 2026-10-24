import type { BlockRule, EventRecord } from '../../core/contracts';
import { addDays, endOfDay, startOfDay, weekdayIndex } from '../../lib/date';

/**
 * Stats aggregation (E5) — pure functions over the event log + current
 * rules. No storage, no React: trivially unit-testable.
 *
 * Definitions (MVP, owned by Ч5):
 * - Protected time — minutes covered by scheduled rule windows inside the
 *   period (rules count from their creation day; paused rules don't count),
 *   minus globally paused intervals reconstructed from the event log.
 * - Attempts — `shield_shown` events in the period.
 * - Streak — consecutive "kept" days scanning back from today. A day is
 *   kept when blocking engaged (own schedule or a shield); today is never
 *   complete — it counts when kept and is skipped otherwise; any earlier
 *   day without kept status (without blocking activity) stops the streak.
 */

export interface Interval {
  /** Inclusive start, exclusive end (ms). */
  start: number;
  end: number;
}

/** Overlap of two half-open intervals, or null when they don't intersect. */
export function overlapIntervals(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Merges overlapping/touching intervals into a sorted, disjoint list. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Sum of interval lengths in ms. */
export function sumIntervals(list: Interval[]): number {
  return list.reduce((total, interval) => total + (interval.end - interval.start), 0);
}

/** Removes `remove` intervals from `from` intervals. */
export function subtractIntervals(from: Interval[], remove: Interval[]): Interval[] {
  const removals = mergeIntervals(remove);
  let result = mergeIntervals(from);
  for (const cut of removals) {
    const next: Interval[] = [];
    for (const interval of result) {
      const overlap = overlapIntervals(interval, cut);
      if (!overlap) {
        next.push(interval);
        continue;
      }
      if (interval.start < overlap.start) {
        next.push({ start: interval.start, end: overlap.start });
      }
      if (overlap.end < interval.end) {
        next.push({ start: overlap.end, end: interval.end });
      }
    }
    result = next;
  }
  return result;
}

function activeWeekdays(rule: BlockRule): Set<number> {
  if (rule.days === 'daily') {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
  return new Set(rule.days);
}

/**
 * Scheduled windows of one rule inside [fromMs, min(toMs, nowMs)], local
 * time. A rule only counts from its creation day onwards.
 */
export function ruleWindowsInRange(
  rule: BlockRule,
  fromMs: number,
  toMs: number,
  nowMs: number,
): Interval[] {
  if (rule.paused || rule.startMin === rule.endMin) {
    return [];
  }
  const rangeEnd = Math.min(toMs, nowMs);
  if (fromMs >= rangeEnd) {
    return [];
  }

  const weekdays = activeWeekdays(rule);
  const wrap = rule.endMin < rule.startMin && rule.endMin > 0;
  const endOffset = rule.endMin === 0 ? 24 * 60 : rule.endMin;
  const windows: Interval[] = [];
  const firstDay = Math.max(startOfDay(fromMs), startOfDay(rule.createdAt));
  const lastDay = startOfDay(rangeEnd);

  const push = (window: Interval) => {
    const clipped = overlapIntervals(window, { start: fromMs, end: rangeEnd });
    if (clipped) {
      windows.push(clipped);
    }
  };

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const today = weekdayIndex(day);
    if (!wrap) {
      if (weekdays.has(today)) {
        push({
          start: day + rule.startMin * 60_000,
          end: day + endOffset * 60_000,
        });
      }
      continue;
    }
    // Overnight: evening half on the start day, morning tail from the day
    // before.
    if (weekdays.has(today)) {
      push({ start: day + rule.startMin * 60_000, end: day + 24 * 60 * 60_000 });
    }
    if (weekdays.has((today + 6) % 7)) {
      push({ start: day, end: day + rule.endMin * 60_000 });
    }
  }
  return windows;
}

/**
 * Global-pause intervals reconstructed from the log: each `paused` event
 * pairs with the next `resumed` event; a trailing open pause ends at the
 * current `pausedUntil` (settings) or at `toMs`.
 */
export function pauseIntervalsFromEvents(
  events: EventRecord[],
  toMs: number,
  currentPausedUntil: number | null,
): Interval[] {
  const intervals: Interval[] = [];
  let openStart: number | null = null;

  const ordered = [...events].sort((a, b) => a.at - b.at);
  for (const event of ordered) {
    if (event.type === 'paused' && openStart === null) {
      openStart = event.at;
    } else if (event.type === 'resumed' && openStart !== null) {
      intervals.push({ start: openStart, end: event.at });
      openStart = null;
    }
  }
  if (openStart !== null) {
    const end =
      currentPausedUntil !== null && Number.isFinite(currentPausedUntil)
        ? Math.min(currentPausedUntil, toMs)
        : toMs;
    if (end > openStart) {
      intervals.push({ start: openStart, end });
    }
  }
  return intervals;
}

export interface StatsSummary {
  /** Scheduled protected minutes in the period (pauses excluded). */
  protectedMinutes: number;
  /** shield_shown events in the period. */
  attempts: number;
  /** Consecutive kept days ending today (see module docs). */
  streakDays: number;
}

export interface AggregateStatsInput {
  /** Events around the period — may reach further back (streak needs it). */
  events: EventRecord[];
  rules: BlockRule[];
  /** Summary period bounds. */
  fromMs: number;
  toMs: number;
  nowMs: number;
  /** settings.globalPausedUntil — caps an open pause interval. */
  currentPausedUntil: number | null;
}

function countEvents(
  events: EventRecord[],
  type: EventRecord['type'],
  from: number,
  to: number,
): number {
  return events.filter((event) => event.type === type && event.at >= from && event.at <= to).length;
}

/**
 * Streak scan. Stops at the earliest evidence (oldest event or rule
 * creation) — beyond that there is no data, treated as neutral.
 */
export function computeStreak(
  rules: BlockRule[],
  events: EventRecord[],
  nowMs: number,
  currentPausedUntil: number | null,
): number {
  const todayStart = startOfDay(nowMs);
  const todayEnd = Math.min(endOfDay(nowMs), nowMs);
  const pauses = mergeIntervals(pauseIntervalsFromEvents(events, todayEnd, currentPausedUntil));

  let earliest = nowMs;
  for (const event of events) {
    earliest = Math.min(earliest, event.at);
  }
  for (const rule of rules) {
    earliest = Math.min(earliest, rule.createdAt);
  }
  if (events.length === 0 && rules.length === 0) {
    return 0;
  }

  let streak = 0;
  let day = todayStart;
  while (day >= startOfDay(earliest)) {
    const dayEnd = day === todayStart ? todayEnd : endOfDay(day);

    let protectedMs = 0;
    for (const rule of rules) {
      protectedMs += sumIntervals(
        subtractIntervals(ruleWindowsInRange(rule, day, dayEnd, nowMs), pauses),
      );
    }
    const dayEvents = events.filter((event) => event.at >= day && event.at <= dayEnd);
    const shields = dayEvents.filter((event) => event.type === 'shield_shown').length;

    const engaged = protectedMs > 0 || shields > 0;
    if (!engaged) {
      if (day === todayStart) {
        day = addDays(day, -1);
        continue;
      }
      break; // neutral day beyond today — stop the scan
    }
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export function aggregateStats(input: AggregateStatsInput): StatsSummary {
  const { events, rules, fromMs, toMs, nowMs, currentPausedUntil } = input;

  const windows: Interval[] = [];
  for (const rule of rules) {
    windows.push(...ruleWindowsInRange(rule, fromMs, toMs, nowMs));
  }
  const pauses = mergeIntervals(pauseIntervalsFromEvents(events, toMs, currentPausedUntil));
  const protectedMs = sumIntervals(subtractIntervals(mergeIntervals(windows), pauses));

  const attempts = countEvents(events, 'shield_shown', fromMs, toMs);

  return {
    protectedMinutes: Math.floor(protectedMs / 60_000),
    attempts,
    streakDays: computeStreak(rules, events, nowMs, currentPausedUntil),
  };
}
