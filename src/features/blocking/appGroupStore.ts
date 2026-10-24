/**
 * Typed access to the Veto keys inside the App Group container.
 *
 * The blocking engine, the extensions and the app all share one
 * `UserDefaults` suite (`group.io.veto.app`, wired by the react-native-device-
 * activity config plugin). This module is the single place that knows the
 * key layout — extensions read the same keys from Swift (see targets/**).
 *
 * The lib's `userDefaults*` functions are wrapped behind `VetoStoreBackend` so
 * the whole layer runs under jest with an in-memory backend.
 */
import type { BlockRule } from '../../core/contracts';
import { isExpoGo } from '../../core/environment';
import type { MirrorMap } from './types';

type DeviceActivityLib = typeof import('react-native-device-activity');

let cachedDeviceActivity: DeviceActivityLib | null | undefined;

/**
 * Guarded require (same idiom as storage/kv.ts): the lib's iOS module graph
 * pulls native-only SwiftUI views that throw at import time under Expo Go,
 * where the App Group suite cannot exist anyway. Native dev-client builds
 * resolve the exact same module a static import would.
 */
function deviceActivity(): DeviceActivityLib | null {
  if (cachedDeviceActivity !== undefined) {
    return cachedDeviceActivity;
  }
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
  return cachedDeviceActivity;
}

/** Storage backend abstraction (lib implementation + in-memory for tests). */
export interface VetoStoreBackend {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  keysWithPrefix(prefix: string): string[];
}

/** Backend backed by the App Group UserDefaults via the native module. */
export const libBackend: VetoStoreBackend = {
  get: <T>(key: string) => deviceActivity()?.userDefaultsGet<T>(key),
  set: (key, value) => {
    deviceActivity()?.userDefaultsSet(key, value);
  },
  remove: (key) => {
    deviceActivity()?.userDefaultsRemove(key);
  },
  keysWithPrefix: (prefix) =>
    Object.keys(deviceActivity()?.userDefaultsAll() ?? {}).filter((key) =>
      key.startsWith(prefix),
    ),
};

/** In-memory backend (tests, mock engine, non-iOS fallbacks). */
export function createMemoryBackend(): VetoStoreBackend {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string) => map.get(key) as T | undefined,
    set: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
    keysWithPrefix: (prefix) => [...map.keys()].filter((key) => key.startsWith(prefix)),
  };
}

// ---------------------------------------------------------------------------
// Key layout (mirrored by the Swift extensions in targets/**)
// ---------------------------------------------------------------------------

/** Engine mirror: every applied rule, enough to re-arm without the repo. */
export const MIRROR_KEY = 'veto_mirror_v1';
/** Global pause deadline (epoch ms) written by pauseAll(). */
export const GLOBAL_PAUSE_UNTIL_KEY = 'veto_global_pause_until';

export const mirrorKey = () => MIRROR_KEY;
export const globalPauseUntilKey = () => GLOBAL_PAUSE_UNTIL_KEY;

/** rule.shieldMessage copy for the shield extension. */
export const shieldMessageKey = (selectionRef: string) => `veto_shield_msg_${selectionRef}`;
/** Absolute end time "HH:MM" for the shield subtitle «до {end}». */
export const shieldEndKey = (selectionRef: string) => `veto_shield_end_${selectionRef}`;
/** SF Symbol shown on the shield. */
export const shieldIconKey = (selectionRef: string) => `veto_shield_icon_${selectionRef}`;

/** One-shot completion marker written by rearmAll(). */
export const oneshotDoneKey = (ruleId: string) => `veto_oneshot_done_${ruleId}`;

// ---------------------------------------------------------------------------
// Live-activity handoff to the DeviceActivityMonitor extension — it starts /
// stops the lock-screen activity at window boundaries while the app is dead.
// ---------------------------------------------------------------------------

/** Current mode ('block' | 'day' | 'both') — written by the JS controller. */
export const LA_MODE_KEY = 'veto_la_mode';
/** Day-mode payload {title, endsAt(epoch ms)} — written by the JS controller. */
export const LA_DAY_KEY = 'veto_la_day';
/** Per-activity block payload {title, endsAt(epoch ms)} — written by apply(). */
export const laActivityKey = (activityName: string) => `veto_la_${activityName}`;

// ---------------------------------------------------------------------------
// Home-screen widget (targets/DayLeftWidget) — appearance preferences
// ---------------------------------------------------------------------------

/** Fill pattern: 'solid' | 'stripes' | 'dots'. */
export const WIDGET_PATTERN_KEY = 'veto_widget_pattern';
/** Whether the widget shows the remaining-day percentage. */
export const WIDGET_SHOW_PERCENT_KEY = 'veto_widget_show_percent';
/** Number font: 'system' | 'rounded' | 'mono'. */
export const WIDGET_FONT_KEY = 'veto_widget_font';
// Live seconds used to be a toggle ("veto_widget_timer_seconds"); the two
// gallery widgets own that choice now — the stale key is simply ignored.

// ---------------------------------------------------------------------------
// Mirror
// ---------------------------------------------------------------------------

export function readMirror(backend: VetoStoreBackend): MirrorMap {
  return backend.get<MirrorMap>(mirrorKey()) ?? {};
}

export function writeMirrorEntry(
  backend: VetoStoreBackend,
  ruleId: string,
  entry: MirrorMap[string],
): void {
  const mirror = readMirror(backend);
  mirror[ruleId] = entry;
  backend.set(mirrorKey(), mirror);
}

export function removeMirrorEntry(backend: VetoStoreBackend, ruleId: string): void {
  const mirror = readMirror(backend);
  if (mirror[ruleId] === undefined) {
    return;
  }
  delete mirror[ruleId];
  backend.set(mirrorKey(), mirror);
}

// ---------------------------------------------------------------------------
// Shield metadata (read by targets/ShieldConfiguration extension)
// ---------------------------------------------------------------------------

/** SF Symbol per strictness — threshold is an hourglass, hard a locked shield. */
export function shieldIconFor(rule: BlockRule): string {
  switch (rule.strictness) {
    case 'threshold':
      return 'hourglass';
    case 'hard':
      return 'lock.shield.fill';
  }
}

export function writeShieldMeta(backend: VetoStoreBackend, rule: BlockRule, endText: string): void {
  backend.set(shieldMessageKey(rule.selectionRef), rule.shieldMessage);
  backend.set(shieldEndKey(rule.selectionRef), endText);
  backend.set(shieldIconKey(rule.selectionRef), shieldIconFor(rule));
}

export function removeShieldMeta(backend: VetoStoreBackend, selectionRef: string): void {
  backend.remove(shieldMessageKey(selectionRef));
  backend.remove(shieldEndKey(selectionRef));
  backend.remove(shieldIconKey(selectionRef));
}

// ---------------------------------------------------------------------------
// One-shot + global pause markers
// ---------------------------------------------------------------------------

export function markOneshotDone(backend: VetoStoreBackend, ruleId: string, now: number): void {
  backend.set(oneshotDoneKey(ruleId), now);
}

export function isOneshotDone(backend: VetoStoreBackend, ruleId: string): boolean {
  return backend.get<number>(oneshotDoneKey(ruleId)) !== undefined;
}

export function readGlobalPauseUntil(backend: VetoStoreBackend): number | null {
  return backend.get<number>(globalPauseUntilKey()) ?? null;
}
