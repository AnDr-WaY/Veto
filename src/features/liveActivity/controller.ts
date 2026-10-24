/**
 * Block-aware lock-screen activity controller.
 *
 * The activity must reflect REALITY, so every sync recomputes the desired
 * payload from three sources — the persisted feature settings, the applied
 * rules (an applied rule counts as running when it is not paused, the clock
 * is inside its window and the global pause is off) and the native support
 * tri-state — then starts / stops the activity to match:
 *
 * - block mode: the running block that ends soonest (title = rule title,
 *   countdown to the rule's window end today; windows never cross midnight);
 * - day mode: countdown to the end of the day under the app's own name;
 * - both: the block overrides the day countdown while one is running.
 *
 * Sync is event-driven (foreground, rule changes, settings changes — see
 * useLiveActivitySync), idempotent and serialized, and it never restarts an
 * activity whose payload is already on screen (≤1 min drift is tolerated —
 * the native seam cannot read the payload back, so the controller remembers
 * the last one it applied).
 *
 * The decision itself is pure (`decideLiveActivity`) — now, rules, support
 * and the pause deadline are all injected, so it is testable without native.
 */

import type { BlockRule } from '../../core/contracts';
import { useRulesStore } from '../../store/rulesStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { LiveActivityMode } from '../storage';
import {
  LA_DAY_KEY,
  LA_MODE_KEY,
  libBackend,
  readGlobalPauseUntil,
} from '../blocking/appGroupStore';
import { isInsideWindow } from '../blocking/ruleCompiler';
import {
  endOfToday,
  isBlockingActivityActive,
  liveActivitySupport,
  startBlockingActivity,
  stopBlockingActivity,
  type BlockingActivityPayload,
  type LiveActivitySupport,
} from './api';
import { liveActivityStrings } from './strings';

// ---------------------------------------------------------------------------
// Pure decision
// ---------------------------------------------------------------------------

/** Everything the decision needs — all injectable, nothing read in place. */
export interface LiveActivityDecisionInput {
  /** Feature switch (Settings row). */
  enabled: boolean;
  /** What the activity should count down to. */
  mode: LiveActivityMode;
  /** Native support tri-state; anything but `ready` means no activity. */
  support: LiveActivitySupport;
  /** Applied rules (the seam snapshot). */
  rules: BlockRule[];
  /** App Group global-pause deadline (epoch ms) or null. */
  pausedUntil: number | null;
  /** Now (epoch ms). */
  now: number;
}

/** Today at 00:00 local time (epoch ms) — the base for window ends. */
function startOfToday(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The rule's window end as epoch ms. An overnight window (or a 24:00 end)
 * running through its evening half finishes on the following day.
 */
export function blockEndsAt(rule: Pick<BlockRule, 'startMin' | 'endMin'>, now: number): number {
  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const wrap = rule.endMin < rule.startMin && rule.endMin > 0;
  const base = startOfToday(now) + rule.endMin * 60_000;
  return (wrap || rule.endMin === 0) && minutes >= rule.startMin ? base + 24 * 60 * 60_000 : base;
}

/** Day-mode payload: countdown to the end of the day under the app's name. */
export function dayPayload(now: number): BlockingActivityPayload {
  return { title: liveActivityStrings.dayTitle, endsAt: endOfToday(new Date(now)) };
}

/** Block-mode payload for a running rule. */
export function blockPayload(rule: BlockRule, now: number): BlockingActivityPayload {
  return { title: rule.title, endsAt: blockEndsAt(rule, now) };
}

/**
 * The block that is actually running right now — an applied rule that is
 * not paused, whose window contains `now`, with the global pause lifted —
 * or null. When several are running, the one ending soonest wins.
 */
export function activeBlock(
  rules: BlockRule[],
  now: number,
  pausedUntil: number | null,
): BlockRule | null {
  if (pausedUntil !== null && now < pausedUntil) {
    return null;
  }
  let soonest: BlockRule | null = null;
  for (const rule of rules) {
    if (rule.paused || !isInsideWindow(rule, now)) {
      continue;
    }
    if (soonest === null || blockEndsAt(rule, now) < blockEndsAt(soonest, now)) {
      soonest = rule;
    }
  }
  return soonest;
}

/**
 * The payload the activity should show right now, or null for "no activity".
 * A running block overrides the day countdown in 'both' mode.
 */
export function decideLiveActivity(
  input: LiveActivityDecisionInput,
): BlockingActivityPayload | null {
  const { enabled, mode, support, rules, pausedUntil, now } = input;
  if (support !== 'ready' || !enabled) {
    return null;
  }
  if (mode === 'day') {
    return dayPayload(now);
  }
  const block = activeBlock(rules, now, pausedUntil);
  if (block === null) {
    return mode === 'block' ? null : dayPayload(now);
  }
  return blockPayload(block, now);
}

/** Drift tolerance: the same countdown within a minute is not a change. */
const PAYLOAD_DRIFT_MS = 60_000;

/**
 * True when the on-screen payload already shows the desired countdown —
 * same title (which also distinguishes the two modes) and an end within a
 * minute. Restarting identical payloads would churn ActivityKit.
 */
export function sameActivityPayload(
  current: BlockingActivityPayload,
  next: BlockingActivityPayload,
): boolean {
  return (
    current.title === next.title && Math.abs(current.endsAt - next.endsAt) <= PAYLOAD_DRIFT_MS
  );
}

// ---------------------------------------------------------------------------
// Impure apply (starts / stops the activity to match the decision)
// ---------------------------------------------------------------------------

/**
 * The payload the controller last put on screen (null = believed stopped).
 * The seam cannot read the payload back, so this memory is the churn guard;
 * it is cleared on failure so the next sync retries.
 */
let lastApplied: BlockingActivityPayload | null = null;

/** Serialized so overlapping triggers (foreground + a store change) cannot
 * interleave start/stop calls. */
let queue: Promise<void> = Promise.resolve();

/**
 * Brings the lock-screen activity in line with reality. Cheap when nothing
 * changed (one decision, no native calls). `rules` is the fresh seam
 * snapshot from useLiveActivitySync; without it the zustand store answers.
 */
export function syncBlockingActivity(rules?: BlockRule[]): Promise<void> {
  const run = queue
    .catch(() => undefined)
    .then(() => applyDesiredActivity(rules ?? useRulesStore.getState().rules));
  queue = run;
  return run;
}

async function applyDesiredActivity(rules: BlockRule[]): Promise<void> {
  const { settings } = useSettingsStore.getState();
  // Handoff for the DeviceActivityMonitor extension: it mirrors this exact
  // decision at window boundaries while the app is dead.
  libBackend.set(LA_MODE_KEY, settings.liveActivityModes);
  libBackend.set(LA_DAY_KEY, dayPayload(Date.now()));
  const desired = decideLiveActivity({
    enabled: settings.liveActivityEnabled,
    mode: settings.liveActivityModes,
    support: liveActivitySupport(),
    rules,
    pausedUntil: readGlobalPauseUntil(libBackend),
    now: Date.now(),
  });
  try {
    if (desired === null) {
      // Only call stop when something may be on screen (or is remembered).
      if (lastApplied !== null || isBlockingActivityActive()) {
        if (await stopBlockingActivity()) {
          lastApplied = null;
        }
      }
      return;
    }
    if (lastApplied !== null && isBlockingActivityActive() && sameActivityPayload(lastApplied, desired)) {
      return; // already showing this countdown — no churn
    }
    if (await startBlockingActivity(desired)) {
      lastApplied = desired;
    } else {
      lastApplied = null; // start refused — retry on the next trigger
    }
  } catch {
    lastApplied = null; // state unknown — let the next sync reconcile
  }
}

// ---------------------------------------------------------------------------
// Settings UI support
// ---------------------------------------------------------------------------

/** Mode segments for the Settings picker, in display order. */
export const LIVE_ACTIVITY_MODE_OPTIONS: readonly {
  value: LiveActivityMode;
  label: string;
}[] = [
  { value: 'day', label: liveActivityStrings.modes.day },
  { value: 'block', label: liveActivityStrings.modes.block },
  { value: 'both', label: liveActivityStrings.modes.both },
];
