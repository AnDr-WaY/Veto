/**
 * Pure view-model for the Rules feature: the two creation drafts (quick
 * block / schedule), locale-aware weekday ordering, draft validation,
 * timeline segments and next-block selection. No React, no native imports —
 * everything is unit-testable on plain data.
 */

import {
  MINUTES_PER_DAY,
  MINUTES_STEP,
  isQuarterMinute,
  isWrapWindow,
} from '@/core/contracts';
import type {
  BlockRule,
  DaysOfWeek,
  NewBlockRule,
  RuleDays,
  Strictness,
} from '@/core/contracts';
import { isSameDay } from '@/lib/date';
import { formatDuration, minutesToHHMM, roundToStep } from '@/lib/time';
import { CATALOG_APPS } from './appCatalog';
import { parseDemoSelection } from './__mocks__/mockBackend';
import { rulesStrings } from './strings';

// ---------------------------------------------------------------------------
// Drafts (creation state)
// ---------------------------------------------------------------------------

/**
 * How strictly the block holds. The skip mechanic was removed — every block
 * is either a plain window shield (hard) or a usage-threshold one.
 */
export type BlockMode = Strictness;

/** Shared selection fields of both drafts. */
interface DraftBase {
  selectionRef: string;
  selectionCount: number;
  /** Display-only chip label for the selection (demo mode: app names). */
  selectionLabel: string;
  mode: BlockMode;
  /** Web domains inside the selection (native picks only; undefined = unknown). */
  webDomainCount?: number;
  /**
   * Explicit title — set when editing (the user renames the block). Left
   * undefined on creation, where the title derives from the selection label.
   */
  title?: string;
}

/**
 * Quick block: starts the moment it is created — the only thing the user
 * picks (besides apps) is when it ends, and how strict it is.
 */
export interface QuickBlockDraft extends DraftBase {
  endMin: number;
}

/**
 * Schedule: always recurring. The user picks apps first, then the days and
 * the time window. No "from now", no one-shot.
 */
export interface ScheduleDraft extends DraftBase {
  days: DaysOfWeek[];
  startMin: number;
  endMin: number;
}

/** Default quick-block length (minutes), from now. */
export const QUICK_DEFAULT_MINUTES = 60;

/** Schedule window defaults — a familiar 9-to-17 working window. */
export const SCHEDULE_DEFAULT_START = 9 * 60;
export const SCHEDULE_DEFAULT_END = 17 * 60;

export const MIN_THRESHOLD_MIN = 15;

/** Minutes since midnight right now, local time. */
export function nowMinutesLocal(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Snap to the time grid, clamped into [0, 24:00] (wrapping past midnight). */
export function clampGrid(minutes: number): number {
  const snapped = roundToStep(minutes, MINUTES_STEP);
  return ((snapped % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function defaultQuickDraft(nowMin: number = nowMinutesLocal()): QuickBlockDraft {
  return {
    selectionRef: '',
    selectionCount: 0,
    selectionLabel: '',
    endMin: clampGrid(nowMin + QUICK_DEFAULT_MINUTES),
    mode: 'hard',
  };
}

export function defaultScheduleDraft(): ScheduleDraft {
  return {
    selectionRef: '',
    selectionCount: 0,
    selectionLabel: '',
    days: [0, 1, 2, 3, 4, 5, 6],
    startMin: SCHEDULE_DEFAULT_START,
    endMin: SCHEDULE_DEFAULT_END,
    mode: 'hard',
  };
}

// ---------------------------------------------------------------------------
// Locale-aware week ordering (schedule days row)
// ---------------------------------------------------------------------------

/** Regions whose calendars start the week on Sunday. Everything else → Monday. */
const SUNDAY_FIRST_REGIONS = new Set([
  'US', 'CA', 'JP', 'CN', 'KR', 'IN', 'IL', 'SA', 'AE', 'TW', 'TH', 'HK', 'MO', 'PH', 'MY', 'ID', 'BD', 'PK',
]);

function resolvedLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

/** 0 when the locale's week starts on Sunday, 1 for Monday. */
export function firstWeekdayIndex(locale?: string): 0 | 1 {
  const tag = locale ?? resolvedLocale();
  const region = /[-_]([A-Za-z]{2})(?![A-Za-z])/.exec(tag)?.[1]?.toUpperCase();
  return region !== undefined && SUNDAY_FIRST_REGIONS.has(region) ? 0 : 1;
}

/** Day indices in display order, e.g. Monday-first → [1, 2, 3, 4, 5, 6, 0]. */
export function orderedWeekdays(firstDay: 0 | 1): DaysOfWeek[] {
  return Array.from({ length: 7 }, (_, index) => ((firstDay + index) % 7) as DaysOfWeek);
}

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

/** Keys of problems — screens map them to localized copy. */
export type QuickDraftProblem = 'selectionEmpty' | 'untilInvalid';
export type ScheduleDraftProblem =
  | 'selectionEmpty'
  | 'daysEmpty'
  | 'rangeInvalid';

export function quickDraftProblems(draft: QuickBlockDraft, nowMin: number): QuickDraftProblem[] {
  const problems: QuickDraftProblem[] = [];
  if (draft.selectionRef.trim().length === 0 || draft.selectionCount < 1) {
    problems.push('selectionEmpty');
  }
  // A wrap end (endMin < nowMin) means "until that time tomorrow".
  if (!isQuarterMinute(draft.endMin) || (draft.endMin % MINUTES_PER_DAY) === nowMin) {
    problems.push('untilInvalid');
  }
  return problems;
}

export function scheduleDraftProblems(draft: ScheduleDraft): ScheduleDraftProblem[] {
  const problems: ScheduleDraftProblem[] = [];
  if (draft.selectionRef.trim().length === 0 || draft.selectionCount < 1) {
    problems.push('selectionEmpty');
  }
  if (draft.days.length === 0) {
    problems.push('daysEmpty');
  }
  // endMin < startMin is a wrap window crossing midnight; only a
  // zero-length window is invalid. A 00:00 end means "until midnight".
  const invalidRange =
    !isQuarterMinute(draft.startMin) ||
    !isQuarterMinute(draft.endMin) ||
    (draft.startMin === draft.endMin && !(draft.startMin === 0 && draft.endMin === MINUTES_PER_DAY));
  if (invalidRange) {
    problems.push('rangeInvalid');
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Draft → contract payload
// ---------------------------------------------------------------------------

/** Block title derived from the demo selection label: "Instagram +2". */
export function derivedTitle(selectionLabel: string, fallback: string): string {
  const names = selectionLabel.split(', ').map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return fallback;
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names[0]} +${names.length - 1}`;
}

function sharedPayload(draft: DraftBase, fallbackTitle: string) {
  const trimmedTitle = draft.title?.trim();
  return {
    title:
      trimmedTitle !== undefined && trimmedTitle.length > 0
        ? trimmedTitle
        : derivedTitle(draft.selectionLabel, fallbackTitle),
    selectionRef: draft.selectionRef,
    selectionCount: draft.selectionCount,
    webDomainCount: draft.webDomainCount,
    strictness: draft.mode as Strictness,
    thresholdMin: undefined,
    shieldMessage: rulesStrings.create.shieldMessageDefault,
  };
}

/** Quick block: one-shot window starting at the current minute — right now. */
export function quickDraftToNewBlockRule(
  draft: QuickBlockDraft,
  nowMin: number = nowMinutesLocal(),
): NewBlockRule {
  return {
    ...sharedPayload(draft, rulesStrings.create.defaultQuickName),
    days: 'daily',
    startMin: Math.max(0, Math.min(MINUTES_PER_DAY - 1, nowMin)),
    // A wheel pick of 00:00 means "until midnight" — store it as 24:00 so
    // the window never looks inverted.
    endMin: draft.endMin === 0 ? MINUTES_PER_DAY : draft.endMin,
    oneShot: true,
  };
}

/** Schedule: recurring window; all seven days collapse to "daily". */
export function scheduleDraftToNewBlockRule(draft: ScheduleDraft): NewBlockRule {
  const days: RuleDays =
    draft.days.length === 7
      ? 'daily'
      : ([...draft.days].sort((a, b) => a - b) as DaysOfWeek[]);
  return {
    ...sharedPayload(draft, rulesStrings.create.defaultScheduleName),
    days,
    startMin: draft.startMin,
    endMin: draft.endMin === 0 ? MINUTES_PER_DAY : draft.endMin,
    oneShot: undefined,
  };
}

// ---------------------------------------------------------------------------
// Rule → draft (edit prefill)
// ---------------------------------------------------------------------------

/** Selection label recovered from a rule: demo names, or nothing on native. */
export function demoSelectionNames(selectionRef: string): string[] {
  return parseDemoSelection(selectionRef).flatMap((id) => {
    const app = CATALOG_APPS.find((candidate) => candidate.id === id);
    return app ? [app.name] : [];
  });
}

/**
 * Prefill for editing a quick block: the wizard keeps the stored window
 * (its original start included) — only what the user changes is saved over.
 */
export function blockRuleToQuickDraft(rule: BlockRule): QuickBlockDraft {
  return {
    selectionRef: rule.selectionRef,
    selectionCount: rule.selectionCount,
    selectionLabel: demoSelectionNames(rule.selectionRef).join(', '),
    webDomainCount: rule.webDomainCount,
    mode: rule.strictness,
    endMin: rule.endMin,
    title: rule.title,
  };
}

/** Prefill for editing a schedule ('daily' expands back to all seven days). */
export function blockRuleToScheduleDraft(rule: BlockRule): ScheduleDraft {
  return {
    selectionRef: rule.selectionRef,
    selectionCount: rule.selectionCount,
    selectionLabel: demoSelectionNames(rule.selectionRef).join(', '),
    webDomainCount: rule.webDomainCount,
    mode: rule.strictness,
    days: rule.days === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [...rule.days],
    startMin: rule.startMin,
    endMin: rule.endMin,
    title: rule.title,
  };
}

// ---------------------------------------------------------------------------
// Today state: timeline + next blocks
// ---------------------------------------------------------------------------

export const WEEKDAYS: readonly DaysOfWeek[] = [1, 2, 3, 4, 5];
export const WEEKENDS: readonly DaysOfWeek[] = [0, 6];

/** Reverse mapping used by chips on list screens. */
export function formatDays(days: RuleDays): string {
  if (days === 'daily') {
    return rulesStrings.days.daily;
  }
  const same = (list: readonly DaysOfWeek[]) =>
    list.length === days.length && list.every((d, i) => d === days[i]);
  if (same(WEEKDAYS)) {
    return rulesStrings.days.weekdays;
  }
  if (same(WEEKENDS)) {
    return rulesStrings.days.weekends;
  }
  const sorted = [...days].sort((a, b) => a - b) as DaysOfWeek[];
  return sorted.map((d) => rulesStrings.days.weekdayShort[d]).join(', ');
}

/** Rule-aware day label: quick blocks run once, not "every day". */
export function formatRuleDays(rule: BlockRule): string {
  return rule.oneShot ? rulesStrings.days.oneTime : formatDays(rule.days);
}

/**
 * True when a quick (one-shot) block's window has passed: it ended earlier
 * today, or it was created on a previous day. Wrap windows expire only after
 * their post-midnight tail. Recurring rules never expire.
 */
export function isOneShotExpired(rule: BlockRule, now: Date = new Date()): boolean {
  if (!rule.oneShot) {
    return false;
  }
  const nowMin = nowMinutesLocal(now);
  if (isWrapWindow(rule)) {
    // The window runs from the creation evening into the next morning —
    // anchor the absolute end to the creation day's midnight. This must be
    // checked before the same-day shortcut, or the tail after midnight
    // would be treated as expired.
    const created = new Date(rule.createdAt);
    const midnight = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const endMs = midnight.getTime() + (MINUTES_PER_DAY + rule.endMin) * 60_000;
    return now.getTime() >= endMs;
  }
  if (!isSameDay(rule.createdAt, now.getTime())) {
    return true;
  }
  return nowMin >= rule.endMin;
}

/** True when the rule's days include the given weekday. */
export function isActiveOnDay(rule: BlockRule, weekday: DaysOfWeek): boolean {
  return rule.days === 'daily' || rule.days.includes(weekday);
}

export type RuleState = 'paused' | 'active' | 'upcoming' | 'done' | 'offDay';

export function ruleState(rule: BlockRule, nowMin: number, weekday: DaysOfWeek): RuleState {
  if (rule.paused) {
    return 'paused';
  }
  if (isWrapWindow(rule)) {
    // Evening part (today) and morning tail (started yesterday).
    if (nowMin >= rule.startMin) {
      return isActiveOnDay(rule, weekday) ? 'active' : 'offDay';
    }
    if (nowMin < rule.endMin) {
      return isActiveOnDay(rule, ((weekday + 6) % 7) as DaysOfWeek) ? 'active' : 'offDay';
    }
    return isActiveOnDay(rule, weekday) ? 'upcoming' : 'offDay';
  }
  if (!isActiveOnDay(rule, weekday)) {
    return 'offDay';
  }
  if (nowMin < rule.startMin) {
    return 'upcoming';
  }
  if (nowMin < rule.endMin) {
    return 'active';
  }
  return 'done';
}

/** Day-fraction segments for the Home timeline (blocked rules only). */
export function timelineSegments(rules: BlockRule[], weekday: DaysOfWeek): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  for (const rule of rules) {
    if (rule.paused) {
      continue;
    }
    if (isWrapWindow(rule)) {
      // Evening half on the start day, morning half carried over from the
      // previous day — both live inside today's 24 hours.
      if (isActiveOnDay(rule, weekday)) {
        segments.push({ start: rule.startMin / MINUTES_PER_DAY, end: 1, tone: 'blocked' });
      }
      if (isActiveOnDay(rule, ((weekday + 6) % 7) as DaysOfWeek)) {
        segments.push({ start: 0, end: rule.endMin / MINUTES_PER_DAY, tone: 'blocked' });
      }
      continue;
    }
    if (isActiveOnDay(rule, weekday)) {
      segments.push({
        start: rule.startMin / MINUTES_PER_DAY,
        end: rule.endMin / MINUTES_PER_DAY,
        tone: 'blocked',
      });
    }
  }
  return segments.filter((segment) => segment.end > segment.start);
}

export interface TimelineSegment {
  start: number;
  end: number;
  tone: 'blocked';
}

export interface NextBlocks {
  /** Rules whose window contains `nowMin` (sorted by start). */
  active: BlockRule[];
  /** Rules starting later today (sorted by start). */
  upcoming: { rule: BlockRule; startsInMin: number }[];
}

export function nextBlocks(rules: BlockRule[], nowMin: number, weekday: DaysOfWeek): NextBlocks {
  const previous = ((weekday + 6) % 7) as DaysOfWeek;
  const stillRunning = (rule: BlockRule): boolean =>
    isWrapWindow(rule)
      ? nowMin >= rule.startMin || nowMin < rule.endMin
      : rule.endMin > nowMin;
  const relevantToday = rules.filter(
    (rule) => !rule.paused && stillRunning(rule) &&
      (isActiveOnDay(rule, weekday) || (isWrapWindow(rule) && nowMin < rule.endMin && isActiveOnDay(rule, previous))),
  );
  const active = relevantToday
    .filter((rule) => ruleState(rule, nowMin, weekday) === 'active')
    .sort((a, b) => a.startMin - b.startMin);
  const upcoming = relevantToday
    .filter((rule) => isActiveOnDay(rule, weekday) && rule.startMin > nowMin)
    .sort((a, b) => a.startMin - b.startMin)
    .map((rule) => ({ rule, startsInMin: rule.startMin - nowMin }));
  return { active, upcoming };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function formatRange(startMin: number, endMin: number): string {
  const end = endMin >= MINUTES_PER_DAY ? '24:00' : minutesToHHMM(endMin);
  return `${minutesToHHMM(startMin)} – ${end}`;
}

/** True when the range crosses midnight (endMin before startMin). */
export function isOvernightRange(startMin: number, endMin: number): boolean {
  return endMin < startMin && endMin > 0;
}

/** "23:00 – 01:00 · 2 h" — the duration makes overnight ranges unambiguous. */
export function formatRangeWithDuration(startMin: number, endMin: number): string {
  const range = formatRange(startMin, endMin);
  if (!isOvernightRange(startMin, endMin)) {
    return range;
  }
  const duration = (endMin + MINUTES_PER_DAY - startMin) % MINUTES_PER_DAY;
  return `${range} · ${formatDuration(duration)}`;
}

/**
 * Detail screen Apps line: demo mode lists the actual app names; native
 * shows the count ("N apps", plus "· M websites" when the pick reported
 * web domains — Apple exposes nothing more granular than counts).
 */
export function formatSelectionDetail(rule: Pick<BlockRule, 'selectionRef' | 'selectionCount' | 'webDomainCount'>): string {
  const names = demoSelectionNames(rule.selectionRef);
  if (names.length > 0) {
    return names.join(', ');
  }
  const webDomains = rule.webDomainCount ?? 0;
  const apps = Math.max(0, rule.selectionCount - webDomains);
  if (webDomains > 0) {
    return rulesStrings.detail.appsAndSitesLine(apps, webDomains);
  }
  return rulesStrings.detail.appsCountLine(apps);
}

/** "45 min" / "1 h" style label for a countdown. */
export function formatCountdown(minutes: number): string {
  return formatDuration(Math.max(0, minutes));
}

export function strictnessTitle(strictness: Strictness): string {
  switch (strictness) {
    case 'threshold':
      return rulesStrings.strictness.threshold;
    case 'hard':
      return rulesStrings.strictness.hard;
  }
}

export function strictnessDetail(rule: BlockRule): string {
  if (rule.strictness === 'threshold') {
    return rulesStrings.detail.thresholdLine(rule.thresholdMin ?? MIN_THRESHOLD_MIN);
  }
  return rulesStrings.detail.hardLine;
}
