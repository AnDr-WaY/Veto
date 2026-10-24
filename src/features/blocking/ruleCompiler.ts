/**
 * Pure compiler: BlockRule → DeviceActivity schedules.
 *
 * No native imports — the only react-native-device-activity usage is erased
 * type imports, so this file is fully unit-testable under jest.
 *
 * DeviceActivity notes encoded here:
 * - A schedule has no weekday filter, so a rule active on N days compiles to N
 *   activities (`veto_rule_<id>_d<day>`); `daily` compiles to one activity.
 * - Weekday component uses Apple numbering: 1 = Sunday … 7 = Saturday
 *   (contracts use 0 = Sunday, so weekday = day + 1).
 * - `hour` is 0…23; endMin 1440 (24:00) compiles to 00:00 — Apple treats a
 *   recurring interval ending at midnight as end-of-day.
 * - One-shot rules use absolute date components (year/month/day + time) and
 *   repeats: false.
 */
import type { BlockRule, DaysOfWeek } from '../../core/contracts';
import { MINUTES_PER_DAY, isWrapWindow, windowMinutes } from '../../core/contracts';
import type {
  DateComponents,
  DeviceActivityEvent,
} from 'react-native-device-activity';

import type { CompiledActivity } from './types';

/** Prefix for every DeviceActivityName Veto owns. */
export const RULE_ACTIVITY_PREFIX = 'veto_rule_';
/** Prefix of the one-shot activities that re-block after a grace window. */
export const GRACE_ACTIVITY_PREFIX = 'veto_grace_';
/** Global-pause activity (re-blocks everything after `pauseAll`). */
export const GLOBAL_PAUSE_ACTIVITY = 'veto_global_pause';

/** Day suffix separator for per-weekday activities. */
const DAY_SUFFIX = '_d';

/** Usage-threshold event name for a rule (Threshold strictness). */
export function thresholdEventName(ruleId: string): string {
  return `veto_threshold_${ruleId}`;
}

/** Activity name for a daily rule. */
export function dailyActivityName(ruleId: string): string {
  return `${RULE_ACTIVITY_PREFIX}${ruleId}`;
}

/** Activity name for a single weekday of a rule. */
export function weekdayActivityName(ruleId: string, day: DaysOfWeek): string {
  return `${RULE_ACTIVITY_PREFIX}${ruleId}${DAY_SUFFIX}${day}`;
}

/** Evening half of an overnight window (start..24:00). */
export function nightActivityName(ruleId: string, day: DaysOfWeek): string {
  return `${RULE_ACTIVITY_PREFIX}${ruleId}_n${day}`;
}

/** Morning half of an overnight window (00:00..end). */
export function morningActivityName(ruleId: string, day: DaysOfWeek): string {
  return `${RULE_ACTIVITY_PREFIX}${ruleId}_m${day}`;
}

/** Names of the two halves of a daily overnight window. */
export function dailyWrapActivityNames(ruleId: string): [string, string] {
  return [`${dailyActivityName(ruleId)}_n`, `${dailyActivityName(ruleId)}_m`];
}

/**
 * All monitor activity names a rule compiles to. Overnight (wrap) windows
 * compile to two activities — an evening half ending at midnight and a
 * morning half starting at midnight on the following day.
 */
export function ruleActivityNames(rule: Pick<BlockRule, 'id' | 'days' | 'startMin' | 'endMin'>): string[] {
  const wrap = isWrapWindow(rule);
  if (rule.days === 'daily') {
    return wrap ? [...dailyWrapActivityNames(rule.id)] : [dailyActivityName(rule.id)];
  }
  const days = [...new Set(rule.days)].sort((a, b) => a - b);
  if (!wrap) {
    return days.map((day) => weekdayActivityName(rule.id, day));
  }
  const names: string[] = [];
  for (const day of days) {
    names.push(nightActivityName(rule.id, day));
    names.push(morningActivityName(rule.id, ((day + 1) % 7) as DaysOfWeek));
  }
  return [...new Set(names)];
}

/** Activity name of the grace re-block one-shot for a rule. */
export function graceActivityName(ruleId: string): string {
  return `${GRACE_ACTIVITY_PREFIX}${ruleId}`;
}

/** True when the name was produced by this compiler (used for cleanup). */
export function isVetoActivityName(name: string): boolean {
  return (
    name.startsWith(RULE_ACTIVITY_PREFIX) ||
    name.startsWith(GRACE_ACTIVITY_PREFIX) ||
    name === GLOBAL_PAUSE_ACTIVITY
  );
}

/** Minutes-from-midnight → time-of-day components (24:00 → 00:00). */
export function minutesToTimeComponents(minutes: number): DateComponents {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) {
    throw new RangeError(`minutes out of range [0, 1440]: ${minutes}`);
  }
  const normalized = minutes === 24 * 60 ? 0 : minutes;
  return { hour: Math.floor(normalized / 60), minute: normalized % 60 };
}

/** Contracts weekday (0 = Sunday) → Apple weekday component (1 = Sunday). */
export function appleWeekday(day: DaysOfWeek): number {
  return day + 1;
}

function assertCompilable(rule: BlockRule): void {
  if (!Number.isInteger(rule.startMin) || !Number.isInteger(rule.endMin)) {
    throw new RangeError(`rule ${rule.id}: startMin/endMin must be integers`);
  }
  if (rule.startMin < 0 || rule.startMin >= MINUTES_PER_DAY || rule.endMin > MINUTES_PER_DAY) {
    throw new RangeError(
      `rule ${rule.id}: window must satisfy 0 <= startMin < 1440 and endMin <= 1440, got ${rule.startMin}..${rule.endMin}`,
    );
  }
  if (windowMinutes(rule.startMin, rule.endMin) <= 0) {
    throw new RangeError(`rule ${rule.id}: window must be at least one minute long`);
  }
}

function timeComponentsOf(date: Date): DateComponents {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1, // Apple months are 1-based
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

/**
 * Next occurrence of the rule's window start strictly after `now` (epoch ms).
 * One-shot rules are scheduled at this exact point in time.
 */
export function nextOccurrence(rule: BlockRule, now: number): Date {
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = new Date(candidate);
    day.setDate(candidate.getDate() + offset);
    const jsDay = day.getDay() as DaysOfWeek;
    const dayMatches = rule.days === 'daily' || rule.days.includes(jsDay);
    if (!dayMatches) {
      continue;
    }
    day.setHours(Math.floor(rule.startMin / 60), rule.startMin % 60, 0, 0);
    if (day.getTime() > now) {
      return day;
    }
  }
  // Unreachable: within 8 days every weekday has occurred.
  throw new Error(`rule ${rule.id}: no upcoming occurrence`);
}

function thresholdEvents(rule: BlockRule, selectionToken: string): DeviceActivityEvent[] {
  if (rule.strictness !== 'threshold') {
    return [];
  }
  const thresholdMin = rule.thresholdMin ?? 0;
  if (!Number.isInteger(thresholdMin) || thresholdMin < 1) {
    throw new RangeError(`rule ${rule.id}: thresholdMin must be an integer >= 1`);
  }
  return [
    {
      eventName: thresholdEventName(rule.id),
      familyActivitySelection: selectionToken,
      threshold: { hour: 0, minute: thresholdMin },
      includesPastActivity: false,
    },
  ];
}

/**
 * Compiles a rule into its monitor activities.
 *
 * `selectionToken` is the encoded FamilyActivitySelection (registry value for
 * `rule.selectionRef`); only threshold rules embed it (usage events need the
 * tokens to count).
 */
export function compileRuleActivities(
  rule: BlockRule,
  selectionToken: string,
  now: number = Date.now(),
): CompiledActivity[] {
  assertCompilable(rule);

  const events = thresholdEvents(rule, selectionToken);
  const start = minutesToTimeComponents(rule.startMin);
  const end = minutesToTimeComponents(rule.endMin);

  if (rule.oneShot) {
    const occurrence = nextOccurrence(rule, now);
    const startDate = timeComponentsOf(occurrence);
    const endDate = timeComponentsOf(
      new Date(occurrence.getTime() + windowMinutes(rule.startMin, rule.endMin) * 60_000),
    );
    return [
      {
        name: dailyActivityName(rule.id),
        schedule: { intervalStart: startDate, intervalEnd: endDate, repeats: false },
        events,
      },
    ];
  }

  if (!isWrapWindow(rule)) {
    if (rule.days === 'daily') {
      return [
        {
          name: dailyActivityName(rule.id),
          schedule: { intervalStart: start, intervalEnd: end, repeats: true },
          events,
        },
      ];
    }

    return [...new Set(rule.days)].sort((a, b) => a - b).map((day) => ({
      name: weekdayActivityName(rule.id, day),
      schedule: {
        intervalStart: { ...start, weekday: appleWeekday(day) },
        intervalEnd: { ...end, weekday: appleWeekday(day) },
        repeats: true,
      },
      events,
    }));
  }

  // Overnight window: Apple's DeviceActivitySchedule handles cross-midnight
  // intervals inconsistently, so split the window at midnight into two
  // recurring activities — [start .. 24:00) and [00:00 .. end) next day.
  const midnight: DateComponents = { hour: 0, minute: 0 };
  const endOfDay: DateComponents = { hour: 0, minute: 0 }; // 24:00

  if (rule.days === 'daily') {
    const [nightName, morningName] = dailyWrapActivityNames(rule.id);
    return [
      {
        name: nightName,
        schedule: { intervalStart: start, intervalEnd: endOfDay, repeats: true },
        events,
      },
      {
        name: morningName,
        schedule: { intervalStart: midnight, intervalEnd: end, repeats: true },
        events,
      },
    ];
  }

  const activities: CompiledActivity[] = [];
  for (const day of [...new Set(rule.days)].sort((a, b) => a - b)) {
    const nextDay = ((day + 1) % 7) as DaysOfWeek;
    activities.push({
      name: nightActivityName(rule.id, day),
      schedule: {
        intervalStart: { ...start, weekday: appleWeekday(day) },
        intervalEnd: { ...endOfDay, weekday: appleWeekday(day) },
        repeats: true,
      },
      events,
    });
    activities.push({
      name: morningActivityName(rule.id, nextDay),
      schedule: {
        intervalStart: { ...midnight, weekday: appleWeekday(nextDay) },
        intervalEnd: { ...end, weekday: appleWeekday(nextDay) },
        repeats: true,
      },
      events,
    });
  }
  return activities;
}

/**
 * One-shot activity starting `now` and ending after `durationMin` — used for
 * grace re-block and the global pause. Absolute date components make it valid
 * even when the window crosses midnight.
 */
export function compileFromNowActivity(
  name: string,
  durationMin: number,
  now: number = Date.now(),
): CompiledActivity {
  if (!Number.isInteger(durationMin) || durationMin < 1) {
    throw new RangeError(`durationMin must be an integer >= 1: ${durationMin}`);
  }
  const start = timeComponentsOf(new Date(now));
  const end = timeComponentsOf(new Date(now + durationMin * 60_000));
  return {
    name,
    schedule: { intervalStart: start, intervalEnd: end, repeats: false },
    events: [],
  };
}

/**
 * True when `now` falls inside the rule's window on its day — a rule applied
 * mid-window gets no intervalDidStart callback, so the engine blocks at once.
 */
export function isInsideWindow(rule: BlockRule, now: number = Date.now()): boolean {
  const date = new Date(now);
  const jsDay = date.getDay() as DaysOfWeek;
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (isWrapWindow(rule)) {
    if (minutes >= rule.startMin) {
      // Evening half runs on the start day.
      return rule.days === 'daily' || rule.days.includes(jsDay);
    }
    if (minutes < rule.endMin) {
      // Morning half belongs to the previous day's window.
      const previousDay = ((jsDay + 6) % 7) as DaysOfWeek;
      return rule.days === 'daily' || rule.days.includes(previousDay);
    }
    return false;
  }
  if (rule.days !== 'daily' && !rule.days.includes(jsDay)) {
    return false;
  }
  return minutes >= rule.startMin && minutes < rule.endMin;
}
