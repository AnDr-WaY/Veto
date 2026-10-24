/**
 * Public surface of the blocking feature.
 *
 * `getBlockingEngine()` is the only way screens/store obtain an engine:
 * - EXPO_PUBLIC_ENGINE=mock → MockBlockingEngine (demo/CI, no entitlement);
 * - non-iOS or missing native module → MockBlockingEngine (safe no-op-ish);
 * - otherwise → DeviceActivityEngine (Screen Time / DeviceActivity).
 */
import { isExpoGo } from '../../core/environment';

import { DeviceActivityEngine } from './deviceActivityEngine';
import type { ReconcileCapableEngine } from './types';
import { MockBlockingEngine } from './mockEngine';

export type { CompiledActivity, ReconcileCapableEngine } from './types';
export {
  GLOBAL_PAUSE_ACTIVITY,
  compileFromNowActivity,
  compileRuleActivities,
  dailyActivityName,
  graceActivityName,
  isInsideWindow,
  isVetoActivityName,
  nextOccurrence,
  ruleActivityNames,
  thresholdEventName,
  weekdayActivityName,
} from './ruleCompiler';
export {
  createMemoryBackend,
  libBackend,
  readGlobalPauseUntil,
  readMirror,
} from './appGroupStore';
export { DeviceActivityEngine, familyControlsAuthStatus } from './deviceActivityEngine';
export { MockBlockingEngine } from './mockEngine';
export { SelectionPicker, selectionCountFromMetadata } from './SelectionPicker';
export type { SelectionPickerProps } from './SelectionPicker';

/** Engine mode resolved once per JS context. */
export function engineMode(): 'mock' | 'native' {
  // Expo Go has no Family Controls entitlement — the mock engine runs there
  // regardless of EXPO_PUBLIC_ENGINE.
  if (isExpoGo() || process.env.EXPO_PUBLIC_ENGINE === 'mock') {
    return 'mock';
  }
  return loadDeviceActivity()?.isAvailable() === true ? 'native' : 'mock';
}

type DeviceActivityLib = typeof import('react-native-device-activity');

let cachedDeviceActivity: DeviceActivityLib | null | undefined;

/**
 * Guarded require (same idiom as storage/kv.ts): the lib's iOS module graph
 * pulls native-only SwiftUI views that throw at import time under Expo Go.
 * Native dev-client builds resolve the exact same module a static import
 * would.
 */
function loadDeviceActivity(): DeviceActivityLib | null {
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

type BlockingEngineLike = import('../../core/contracts').BlockingEngine;

let cachedEngine: (BlockingEngineLike & ReconcileCapableEngine) | null = null;

/** Singleton engine per the app's mode. */
export function getBlockingEngine(): BlockingEngineLike & ReconcileCapableEngine {
  if (cachedEngine) {
    return cachedEngine;
  }
  cachedEngine = engineMode() === 'mock' ? new MockBlockingEngine() : new DeviceActivityEngine();
  return cachedEngine;
}
