/**
 * Blocking-engine internal types.
 *
 * Everything here is private to src/features/blocking — the public surface is
 * the `BlockingEngine` contract in src/core/contracts.ts plus the extras
 * re-exported from index.ts.
 */
import type { BlockRule } from '../../core/contracts';
import type {
  DeviceActivityEvent,
  DeviceActivitySchedule,
} from 'react-native-device-activity';

/** One DeviceActivity monitor schedule produced by the rule compiler. */
export interface CompiledActivity {
  /** Unique DeviceActivityName, e.g. `veto_rule_<id>_d3`. */
  name: string;
  schedule: DeviceActivitySchedule;
  /** Usage-threshold events (threshold rules only). */
  events: DeviceActivityEvent[];
}

/** Engine snapshot of an applied rule — enough to re-arm without the repo. */
export interface MirrorEntry {
  rule: BlockRule;
  activities: string[];
  appliedAt: number;
}

export type MirrorMap = Record<string, MirrorEntry>;

/**
 * Enforcement reconciliation: removes mirror entries whose rule no longer
 * exists in the app's own storage (storage was lost/reinstalled, or the rule
 * was deleted outside this JS context). Without it such ghosts keep blocking
 * forever with no UI to control them.
 */
export interface ReconcileCapableEngine {
  reconcile(knownRuleIds: string[]): Promise<void>;
}
