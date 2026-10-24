/**
 * DeviceActivity-backed BlockingEngine (primary implementation).
 *
 * Thin orchestration over react-native-device-activity: every rule becomes a
 * set of monitor activities (ruleCompiler.ts) plus pre-configured extension
 * actions (configureActions), and every rule state lives in the App Group
 * (appGroupStore.ts) so the extensions can act while the app is dead.
 *
 * All native calls go through this file only — the rest of the app sees the
 * BlockingEngine contract.
 */
import type { AuthStatus, BlockRule, Strictness } from '../../core/contracts';
import { isWrapWindow, validateRule } from '../../core/contracts';
import { minutesToHHMM } from '../../lib/time';
import { isExpoGo } from '../../core/environment';
import type { CallbackName } from 'react-native-device-activity';

import {
  createMemoryBackend,
  globalPauseUntilKey,
  isOneshotDone,
  laActivityKey,
  libBackend,
  markOneshotDone,
  readGlobalPauseUntil,
  readMirror,
  removeMirrorEntry,
  removeShieldMeta,
  writeMirrorEntry,
  writeShieldMeta,
} from './appGroupStore';
import type { VetoStoreBackend } from './appGroupStore';
import {
  GLOBAL_PAUSE_ACTIVITY,
  compileFromNowActivity,
  compileRuleActivities,
  graceActivityName,
  isInsideWindow,
  ruleActivityNames,
  thresholdEventName,
} from './ruleCompiler';
import type { MirrorEntry, ReconcileCapableEngine } from './types';

type DeviceActivityLib = typeof import('react-native-device-activity');

let cachedDeviceActivity: DeviceActivityLib | null | undefined;

/**
 * Guarded require (same idiom as storage/kv.ts): the lib's iOS module graph
 * pulls native-only SwiftUI views that throw at import time under Expo Go,
 * where Family Controls cannot exist anyway. This engine is only constructed
 * when engineMode() === 'native', so the getter never runs in Go/jest
 * fallbacks; native dev-client builds resolve the exact same module a static
 * import would.
 */
function deviceActivity(): DeviceActivityLib {
  if (cachedDeviceActivity === undefined) {
    if (isExpoGo()) {
      cachedDeviceActivity = null;
    } else {
      try {
        // Literal specifier so Metro keeps the module in the bundle.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cachedDeviceActivity = require('react-native-device-activity') as DeviceActivityLib;
      } catch {
        cachedDeviceActivity = null;
      }
    }
  }
  if (!cachedDeviceActivity) {
    throw new Error('react-native-device-activity is unavailable in this environment');
  }
  return cachedDeviceActivity;
}

/**
 * The extensions read shield configs by selection id and by a fixed fallback
 * key — updateShieldWithId only writes the former shape under shieldId, so
 * the lookup keys are mirrored here (userDefaultsSet is exported by the lib).
 */
function persistShieldConfig(
  config: ReturnType<typeof shieldConfiguration>,
  actions: ReturnType<typeof shieldActions>,
  selectionRef: string,
): void {
  const { userDefaultsSet } = deviceActivity();
  userDefaultsSet(`shieldConfigurationForSelection_${selectionRef}`, config);
  userDefaultsSet(`shieldActionsForSelection_${selectionRef}`, actions);
  userDefaultsSet('shieldConfiguration', config);
  userDefaultsSet('shieldActions', actions);
}

/** Key layout is shared with the extensions; events_<activity>_<callback>. */
const activityEventKey = (activityName: string, callbackName: string) =>
  `events_${activityName}_${callbackName}`;

function mapAuthStatus(native: number): AuthStatus {
  const { AuthorizationStatus } = deviceActivity();
  switch (native) {
    case AuthorizationStatus.approved:
      return 'approved';
    case AuthorizationStatus.denied:
      return 'denied';
    default:
      return 'notDetermined';
  }
}

/**
 * Current Family Controls status, read without prompting. 'approved' where
 * Family Controls cannot exist (Expo Go / missing module) — callers only gate
 * the real native picker, which renders an empty list without authorization.
 */
export function familyControlsAuthStatus(): AuthStatus {
  try {
    if (isExpoGo() || !deviceActivity().isAvailable()) {
      return 'approved';
    }
    return mapAuthStatus(deviceActivity().getAuthorizationStatus());
  } catch {
    return 'approved';
  }
}

function assertApplicable(rule: BlockRule): void {
  const problems = validateRule(rule);
  if (problems.length > 0) {
    throw new Error(`invalid rule ${rule.id}: ${problems.join('; ')}`);
  }
}

/** Absolute end of the rule's current/pending window as epoch ms. */
function blockEndsAtMs(rule: BlockRule, now: number): number {
  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const end = new Date(now);
  end.setHours(Math.floor(rule.endMin / 60), rule.endMin % 60, 0, 0);
  // Overnight windows (and 24:00 ends) finish on the following day when the
  // app is running through the evening half.
  if ((isWrapWindow(rule) || rule.endMin === 0) && minutes >= rule.startMin) {
    end.setDate(end.getDate() + 1);
  }
  return end.getTime();
}

/** Actions executed by the monitor extension when a window opens/closes. */
function windowActions(
  rule: BlockRule,
  callbackName: 'intervalDidStart' | 'intervalDidEnd',
  pauseUntil: number | null,
  nowMs: number = Date.now(),
): unknown[] {
  const common = pauseUntil && pauseUntil > nowMs ? { neverTriggerBefore: new Date(pauseUntil) } : {};
  if (callbackName === 'intervalDidStart') {
    // Threshold rules stay unblocked until eventDidReachThreshold fires.
    if (rule.strictness === 'threshold') {
      return [];
    }
    return [
      {
        type: 'blockSelection',
        familyActivitySelectionId: rule.selectionRef,
        shieldId: rule.selectionRef,
        ...common,
      },
    ];
  }
  return [{ type: 'unblockSelection', familyActivitySelectionId: rule.selectionRef }];
}

/** Shield configuration dict (consumed by the ShieldConfiguration extension). */
function shieldConfiguration(rule: BlockRule, endText: string) {
  const white = { red: 255, green: 255, blue: 255, alpha: 255 };
  return {
    backgroundColor: { red: 10, green: 10, blue: 10, alpha: 255 }, // #0A0A0A
    title: 'BLOCKED',
    titleColor: white,
    subtitle: `by Veto · Until ${endText}`,
    subtitleColor: white,
  };
}

/** Shield action: the system Close button only — no bypass exists. */
function shieldActions() {
  return { primary: { behavior: 'close' as const, type: 'dismiss' as const } };
}

/**
 * Primary engine. `backend`/`clock` are injectable for tests; production uses
 * the App Group UserDefaults via the native module and the wall clock.
 */
export class DeviceActivityEngine implements ReconcileCapableEngine {
  private readonly backend: VetoStoreBackend;
  private readonly clock: () => number;

  constructor(backend: VetoStoreBackend = libBackend, clock: () => number = Date.now) {
    this.backend = backend;
    this.clock = clock;
  }

  async authorize(): Promise<AuthStatus> {
    if (!deviceActivity().isAvailable()) {
      return 'notDetermined';
    }
    try {
      await deviceActivity().requestAuthorization('individual');
    } catch {
      // The poll below resolves the actual user decision (approved/denied);
      // requestAuthorization itself throws on cancel/timeout on some iOS versions.
    }
    const status = await deviceActivity().pollAuthorizationStatus({ maxAttempts: 40, pollIntervalMs: 250 });
    return mapAuthStatus(status);
  }

  async apply(rule: BlockRule): Promise<void> {
    assertApplicable(rule);

    // The picker view only emits the serialized selection — nothing registers
    // it in the shared `familyActivitySelectionIds` registry. Native
    // blockSelection/configureActions resolve selections BY ID, so every ref
    // must be registered (idempotent) before any of them runs.
    deviceActivity().setFamilyActivitySelectionId({
      id: rule.selectionRef,
      familyActivitySelection: rule.selectionRef,
    });
    const token = deviceActivity().getFamilyActivitySelectionId(rule.selectionRef);
    if (!token) {
      throw new Error(
        `no FamilyActivitySelection stored for selectionRef "${rule.selectionRef}" — run the picker first`,
      );
    }

    const now = this.clock();
    const endText = minutesToHHMM(rule.endMin);
    const pauseUntil = readGlobalPauseUntil(this.backend);

    // Shield look & copy (consumed by targets/ShieldConfiguration + actions).
    writeShieldMeta(this.backend, rule, endText);
    const config = shieldConfiguration(rule, endText);
    const actions = shieldActions();
    persistShieldConfig(config, actions, rule.selectionRef);
    deviceActivity().updateShieldWithId(config as never, actions as never, rule.selectionRef);

    const activities = compileRuleActivities(rule, token, now);

    const entry: MirrorEntry = {
      rule,
      activities: activities.map((activity) => activity.name),
      appliedAt: now,
    };
    writeMirrorEntry(this.backend, rule.id, entry);

    if (rule.paused) {
      // Paused: no schedule may keep enforcing the rule, and an in-flight
      // window must lift immediately — this is what "Pause today" means.
      for (const activity of activities) {
        this.backend.remove(laActivityKey(activity.name));
      }
      deviceActivity().stopMonitoring(activities.map((activity) => activity.name));
      for (const activity of activities) {
        deviceActivity().cleanUpAfterActivity(activity.name);
      }
      deviceActivity().unblockSelection(
        { activitySelectionId: rule.selectionRef },
        'veto.apply.paused',
      );
      return;
    }

    // Handoff for the monitor extension: it starts the lock-screen activity
    // at intervalDidStart and tears it down at intervalDidEnd while the app
    // is dead. Every compiled activity carries the rule's payload.
    const laPayload = { title: rule.title, endsAt: blockEndsAtMs(rule, now) };
    for (const activity of activities) {
      this.backend.set(laActivityKey(activity.name), laPayload);
      deviceActivity().configureActions({
        activityName: activity.name,
        callbackName: 'intervalDidStart',
        actions: windowActions(rule, 'intervalDidStart', pauseUntil, now) as never,
      });
      deviceActivity().configureActions({
        activityName: activity.name,
        callbackName: 'intervalDidEnd',
        actions: windowActions(rule, 'intervalDidEnd', null) as never,
      });
      if (rule.strictness === 'threshold') {
        deviceActivity().configureActions({
          activityName: activity.name,
          callbackName: 'eventDidReachThreshold',
          eventName: thresholdEventName(rule.id),
          actions: [
            {
              type: 'blockSelection',
              familyActivitySelectionId: rule.selectionRef,
              shieldId: rule.selectionRef,
            },
          ] as never,
        });
      }
      await deviceActivity().startMonitoring(activity.name, activity.schedule, activity.events);
    }

    // A rule applied mid-window never sees intervalDidStart — block right away.
    if (rule.strictness !== 'threshold' && isInsideWindow(rule, now)) {
      if (!pauseUntil || pauseUntil <= now) {
        deviceActivity().blockSelection({ activitySelectionId: rule.selectionRef }, 'veto.apply.midwindow');
      }
    }
  }

  async remove(ruleId: string): Promise<void> {
    const entry = readMirror(this.backend)[ruleId];
    if (!entry) {
      return;
    }
    // `veto_grace_<id>` is legacy (skip mechanic removed) — stopped so an
    // armed one-shot from an older build cannot re-block out of nowhere.
    const grace = graceActivityName(ruleId);
    deviceActivity().stopMonitoring([...entry.activities, grace]);
    for (const activity of [...entry.activities, grace]) {
      deviceActivity().cleanUpAfterActivity(activity);
    }
    for (const activity of entry.activities) {
      this.backend.remove(laActivityKey(activity));
    }
    deviceActivity().unblockSelection({ activitySelectionId: entry.rule.selectionRef }, 'veto.remove');
    removeShieldMeta(this.backend, entry.rule.selectionRef);
    removeMirrorEntry(this.backend, ruleId);
  }

  /** Tears down enforcement for rules that no longer exist in app storage. */
  async reconcile(knownRuleIds: string[]): Promise<void> {
    const known = new Set(knownRuleIds);
    for (const ruleId of Object.keys(readMirror(this.backend))) {
      if (!known.has(ruleId)) {
        await this.remove(ruleId);
      }
    }
  }

  async pauseAll(durationMin: number): Promise<void> {
    if (!Number.isInteger(durationMin) || durationMin < 1) {
      throw new RangeError(`durationMin must be an integer >= 1: ${durationMin}`);
    }
    const now = this.clock();
    const until = now + durationMin * 60_000;
    const entries = Object.values(readMirror(this.backend)).filter((entry) => !entry.rule.paused);

    this.backend.set(globalPauseUntilKey(), until);

    const reBlockActions = entries.map((entry) => ({
      type: 'blockSelection',
      familyActivitySelectionId: entry.rule.selectionRef,
      shieldId: entry.rule.selectionRef,
    }));
    deviceActivity().configureActions({
      activityName: GLOBAL_PAUSE_ACTIVITY,
      callbackName: 'intervalDidEnd',
      actions: reBlockActions as never,
    });

    const pause = compileFromNowActivity(GLOBAL_PAUSE_ACTIVITY, durationMin, now);
    await deviceActivity().startMonitoring(pause.name, pause.schedule, pause.events);

    // Re-arm intervalDidStart of every rule with neverTriggerBefore so that a
    // window opening during the pause does not re-block immediately.
    for (const entry of entries) {
      this.reconfigureWindowStart(entry.rule, until);
      deviceActivity().unblockSelection({ activitySelectionId: entry.rule.selectionRef }, 'veto.pauseAll');
    }
  }

  async resumeAll(): Promise<void> {
    const now = this.clock();
    deviceActivity().stopMonitoring([GLOBAL_PAUSE_ACTIVITY]);
    deviceActivity().cleanUpAfterActivity(GLOBAL_PAUSE_ACTIVITY);
    this.backend.remove(globalPauseUntilKey());

    for (const entry of Object.values(readMirror(this.backend))) {
      if (entry.rule.paused) {
        continue;
      }
      this.reconfigureWindowStart(entry.rule, null);
      if (isInsideWindow(entry.rule, now) && entry.rule.strictness !== 'threshold') {
        deviceActivity().blockSelection({ activitySelectionId: entry.rule.selectionRef }, 'veto.resumeAll');
      }
    }
  }

  async rearmAll(): Promise<void> {
    const now = this.clock();
    const pauseUntil = readGlobalPauseUntil(this.backend);

    for (const [ruleId, entry] of Object.entries(readMirror(this.backend))) {
      if (entry.rule.paused) {
        continue;
      }
      if (entry.rule.oneShot) {
        const completed = entry.activities.some((activity) => {
          const endedAt = this.backend.get<number>(activityEventKey(activity, 'intervalDidEnd'));
          return typeof endedAt === 'number' && endedAt > entry.appliedAt;
        });
        if (completed || isOneshotDone(this.backend, ruleId)) {
          markOneshotDone(this.backend, ruleId, now);
          continue;
        }
      }

      const token = deviceActivity().getFamilyActivitySelectionId(entry.rule.selectionRef);
      if (!token) {
        continue;
      }

      deviceActivity().stopMonitoring(entry.activities);
      try {
        await this.applySnapshot(entry, token, pauseUntil);
      } catch {
        // Selection decayed or schedule invalid — drop the stale entry.
        removeMirrorEntry(this.backend, ruleId);
      }
    }
  }

  /** Live diagnostics for settings/stats screens (Ч5). */
  diagnostics(): { activities: string[]; mirrorSize: number; pauseUntil: number | null } {
    return {
      activities: deviceActivity().isAvailable() ? deviceActivity().getActivities() : [],
      mirrorSize: Object.keys(readMirror(this.backend)).length,
      pauseUntil: readGlobalPauseUntil(this.backend),
    };
  }

  /** Re-apply from the mirror snapshot without re-running picker validation. */
  private async applySnapshot(entry: MirrorEntry, token: string, pauseUntil: number | null): Promise<void> {
    const rule = entry.rule;
    const now = this.clock();
    const endText = minutesToHHMM(rule.endMin);
    writeShieldMeta(this.backend, rule, endText);
    const config = shieldConfiguration(rule, endText);
    const actions = shieldActions();
    persistShieldConfig(config, actions, rule.selectionRef);
    deviceActivity().updateShieldWithId(config as never, actions as never, rule.selectionRef);
    const laPayload = { title: rule.title, endsAt: blockEndsAtMs(rule, now) };
    for (const activity of compileRuleActivities(rule, token, now)) {
      this.backend.set(laActivityKey(activity.name), laPayload);
      deviceActivity().configureActions({
        activityName: activity.name,
        callbackName: 'intervalDidStart',
        actions: windowActions(rule, 'intervalDidStart', pauseUntil, now) as never,
      });
      deviceActivity().configureActions({
        activityName: activity.name,
        callbackName: 'intervalDidEnd',
        actions: windowActions(rule, 'intervalDidEnd', null) as never,
      });
      if (rule.strictness === 'threshold') {
        deviceActivity().configureActions({
          activityName: activity.name,
          callbackName: 'eventDidReachThreshold',
          eventName: thresholdEventName(rule.id),
          actions: [
            {
              type: 'blockSelection',
              familyActivitySelectionId: rule.selectionRef,
              shieldId: rule.selectionRef,
            },
          ] as never,
        });
      }
      await deviceActivity().startMonitoring(activity.name, activity.schedule, activity.events);
    }
  }

  /** Reconfigure intervalDidStart, optionally suppressed until `pauseUntil`. */
  private reconfigureWindowStart(rule: BlockRule, pauseUntil: number | null): void {
    const now = this.clock();
    for (const activity of ruleActivityNames(rule)) {
      deviceActivity().configureActions({
        activityName: activity,
        callbackName: 'intervalDidStart',
        actions: windowActions(rule, 'intervalDidStart', pauseUntil, now) as never,
      });
    }
  }
}

/** Convenience: strictness values in a typed list (shield/button mapping). */
export const STRICTNESS_ORDER: readonly Strictness[] = ['hard', 'threshold'];

/** Test-only: an engine over an in-memory backend (no native calls). */
export function createTestEngine(): DeviceActivityEngine {
  return new DeviceActivityEngine(createMemoryBackend());
}

export type { CallbackName };
