/**
 * Core contracts shared by every Veto feature.
 *
 * This file is the single source of truth for the data model, the blocking
 * engine interface, repositories and hook signatures. Feature workers import
 * from here — never redefine these shapes locally.
 *
 * Pure types + tiny runtime helpers only: no React, no native imports.
 */

/** Grid step for all rule times (minutes). */
export const MINUTES_STEP = 5;

/** Minutes in a day (24:00 inclusive boundary). */
export const MINUTES_PER_DAY = 24 * 60;

/** How strict a rule is once its window is active. */
export type Strictness =
  /** Shield with no bypass — only a Close button (default). */
  | 'hard'
  /** Shield engages after `thresholdMin` minutes of use inside the window. */
  | 'threshold';

/** Weekday index, 0 = Sunday (JS Date convention). */
export type DaysOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Days a rule is active on — either an explicit list or every day. */
export type RuleDays = DaysOfWeek[] | 'daily';

/** A schedule-based blocking rule. */
export interface BlockRule {
  id: string;
  title: string;
  /**
   * Key of the encoded FamilyActivitySelection stored in the App Group
   * container (selections themselves never live in JS storage).
   */
  selectionRef: string;
  /** Number of apps/web domains inside the selection. */
  selectionCount: number;
  /**
   * Web domains inside the selection, when the picker reported the split
   * (Apple exposes application/webDomain counts separately). Absent on
   * rules picked before this field existed — `selectionCount` is then all
   * the UI knows.
   */
  webDomainCount?: number;
  days: RuleDays;
  /** Minutes from midnight, multiple of the grid step. */
  startMin: number;
  /**
   * Minutes from midnight, multiple of the grid step. When endMin < startMin
   * (and endMin > 0) the window crosses midnight into the next day.
   */
  endMin: number;
  strictness: Strictness;
  /** Required iff strictness is 'threshold': minutes of use before shielding. */
  thresholdMin?: number;
  /** Copy shown on the shield screen. */
  shieldMessage: string;
  paused: boolean;
  /** Epoch milliseconds. */
  createdAt: number;
  /** One-shot rules disarm themselves after the first completed window. */
  oneShot?: boolean;
}

/** Payload for creating a rule — server-assigned fields omitted. */
export type NewBlockRule = Omit<BlockRule, 'id' | 'paused' | 'createdAt'>;

/** Family Controls authorization state. */
export type AuthStatus = 'notDetermined' | 'approved' | 'denied';

/**
 * Native blocking engine. Implemented by the DeviceActivity-backed engine
 * (Ч3) and by the mock engine (EXPO_PUBLIC_ENGINE=mock).
 */
export interface BlockingEngine {
  authorize(): Promise<AuthStatus>;
  apply(rule: BlockRule): Promise<void>;
  remove(ruleId: string): Promise<void>;
  /** Pause every rule for the given number of minutes. */
  pauseAll(durationMin: number): Promise<void>;
  resumeAll(): Promise<void>;
  /** Re-arm DeviceActivity schedules (after edits, reboot, entitlement changes). */
  rearmAll(): Promise<void>;
}

export type EventType =
  | 'rule_applied'
  | 'rule_removed'
  | 'shield_shown'
  | 'bypass'
  | 'paused'
  | 'resumed';

/** One row of the append-only event log (expo-sqlite). */
export interface EventRecord {
  id: string;
  type: EventType;
  /** Null for global (non-rule) events. */
  ruleId: string | null;
  /** Epoch milliseconds. */
  at: number;
  meta?: Record<string, string | number | boolean>;
}

export interface RulesRepository {
  list(): Promise<BlockRule[]>;
  get(id: string): Promise<BlockRule | null>;
  save(rule: BlockRule): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * Optional change notifications (both built-in repositories implement
   * it): mutations emit, and useRules() re-reads so pause/edit reach the
   * screen in the same tick. Wrappers must forward it.
   */
  subscribe?(listener: () => void): () => void;
}

export interface StatsRepository {
  append(event: EventRecord): Promise<void>;
  eventsBetween(fromMs: number, toMs: number): Promise<EventRecord[]>;
}

/** App-level settings (react-native-mmkv). */
export interface AppSettings {
  /** Epoch ms until which every rule is paused, or null. */
  globalPausedUntil: number | null;
  hapticsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  globalPausedUntil: null,
  hapticsEnabled: true,
};

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  set(patch: Partial<AppSettings>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook signatures (implemented by the store/persistence worker)
// ---------------------------------------------------------------------------

export interface UseRulesResult {
  rules: BlockRule[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
export type UseRules = () => UseRulesResult;

export interface RuleActions {
  create(input: NewBlockRule): Promise<BlockRule>;
  update(id: string, patch: Partial<BlockRule>): Promise<void>;
  remove(id: string): Promise<void>;
}
export type UseRuleActions = () => RuleActions;

export interface UseStatsResult {
  events: EventRecord[];
  loading: boolean;
  refresh: () => Promise<void>;
}
export type UseStats = () => UseStatsResult;

export interface UseSettingsResult {
  settings: AppSettings | null;
  loading: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}
export type UseSettings = () => UseSettingsResult;

export interface UseGlobalPauseResult {
  pausedUntil: number | null;
  isPaused: boolean;
  pause: (durationMin: number) => Promise<void>;
  resume: () => Promise<void>;
}
export type UseGlobalPause = () => UseGlobalPauseResult;

// ---------------------------------------------------------------------------
// Runtime validation helpers (shared by forms, engine and persistence)
// ---------------------------------------------------------------------------

/** True for integer minutes within [0, 24:00] on the time grid (5 min). */
export function isQuarterMinute(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MINUTES_PER_DAY &&
    value % MINUTES_STEP === 0
  );
}

/**
 * Window length in minutes. endMin <= startMin (with end > 0) means the
 * window crosses midnight into the next day; endMin 1440 is 24:00 same day.
 * Returns 0 for a degenerate (zero-length) window.
 */
export function windowMinutes(startMin: number, endMin: number): number {
  if (endMin > startMin) {
    return endMin - startMin;
  }
  if (endMin === 0) {
    // A 00:00 end is 24:00 of the same day.
    return startMin === 0 ? 0 : MINUTES_PER_DAY - startMin;
  }
  return (endMin + MINUTES_PER_DAY - startMin) % MINUTES_PER_DAY;
}

/** True when the rule's window crosses midnight into the following day. */
export function isWrapWindow(rule: Pick<BlockRule, 'startMin' | 'endMin'>): boolean {
  return rule.endMin < rule.startMin && rule.endMin > 0;
}

/** True for any whole minute of the day — quick blocks start exactly now. */
export function isMinuteOfDay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MINUTES_PER_DAY;
}

/** Returns a list of human-readable problems; empty list means valid. */
export function validateRule(rule: BlockRule): string[] {
  const problems: string[] = [];

  if (rule.id.trim().length === 0) {
    problems.push('id must not be empty');
  }
  if (rule.title.trim().length === 0) {
    problems.push('title must not be empty');
  }
  if (rule.selectionRef.trim().length === 0) {
    problems.push('selectionRef must not be empty');
  }
  if (!Number.isInteger(rule.selectionCount) || rule.selectionCount < 1) {
    problems.push('selectionCount must be an integer >= 1');
  }
  if (rule.days !== 'daily') {
    const days = rule.days;
    const validDays =
      Array.isArray(days) &&
      days.length > 0 &&
      days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!validDays) {
      problems.push('days must be "daily" or a non-empty list of weekdays 0-6');
    }
  }
  if (!isMinuteOfDay(rule.startMin)) {
    problems.push('startMin must be an integer minute within [0, 24:00]');
  }
  if (!isQuarterMinute(rule.endMin)) {
    problems.push('endMin must be a multiple of the grid step within [0, 24:00]');
  }
  if (
    isMinuteOfDay(rule.startMin) &&
    isQuarterMinute(rule.endMin) &&
    windowMinutes(rule.startMin, rule.endMin) <= 0
  ) {
    problems.push('window must be at least one grid step long');
  }
  if (rule.strictness === 'threshold' && (!rule.thresholdMin || rule.thresholdMin < 1)) {
    problems.push('thresholdMin must be >= 1 for threshold rules');
  }
  if (!Number.isFinite(rule.createdAt)) {
    problems.push('createdAt must be a finite number');
  }

  return problems;
}
