/**
 * MockBlockingEngine — in-memory engine for demo/CI mode
 * (EXPO_PUBLIC_ENGINE=mock) and for non-iOS/test environments where the
 * Family Controls entitlement cannot exist.
 *
 * Mirrors the DeviceActivityEngine semantics (validation, mirror, global
 * pause) without touching any native API, so the full UI stays alive without
 * Screen Time access.
 */
import type { AuthStatus, BlockRule } from '../../core/contracts';
import { validateRule } from '../../core/contracts';
import { minutesToHHMM } from '../../lib/time';

import {
  createMemoryBackend,
  globalPauseUntilKey,
  readGlobalPauseUntil,
  readMirror,
  removeMirrorEntry,
  removeShieldMeta,
  shieldIconFor,
  writeMirrorEntry,
  writeShieldMeta,
} from './appGroupStore';
import type { VetoStoreBackend } from './appGroupStore';
import { isInsideWindow, ruleActivityNames } from './ruleCompiler';
import type { MirrorEntry, ReconcileCapableEngine } from './types';

const MOCK_AUTH_KEY = 'veto_mock_auth';

/**
 * In-memory BlockingEngine. Persists only within the current JS context —
 * exactly what a demo needs.
 */
export class MockBlockingEngine implements ReconcileCapableEngine {
  private readonly backend: VetoStoreBackend;
  private readonly clock: () => number;

  constructor(backend: VetoStoreBackend = createMemoryBackend(), clock: () => number = Date.now) {
    this.backend = backend;
    this.clock = clock;
  }

  /** First call behaves like the user approving the system dialog. */
  async authorize(): Promise<AuthStatus> {
    const previous = this.backend.get<AuthStatus>(MOCK_AUTH_KEY);
    if (previous) {
      return previous;
    }
    this.backend.set(MOCK_AUTH_KEY, 'approved');
    return 'approved';
  }

  async apply(rule: BlockRule): Promise<void> {
    const problems = validateRule(rule);
    if (problems.length > 0) {
      throw new Error(`invalid rule ${rule.id}: ${problems.join('; ')}`);
    }
    const now = this.clock();
    // Mirror the native engine: shield meta + mirror entry, nothing native.
    writeShieldMeta(this.backend, rule, minutesToHHMM(rule.endMin));
    const entry: MirrorEntry = {
      rule,
      activities: ruleActivityNames(rule),
      appliedAt: now,
    };
    writeMirrorEntry(this.backend, rule.id, entry);
  }

  async remove(ruleId: string): Promise<void> {
    const entry = readMirror(this.backend)[ruleId];
    if (!entry) {
      return;
    }
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
    this.backend.set(globalPauseUntilKey(), this.clock() + durationMin * 60_000);
  }

  async resumeAll(): Promise<void> {
    this.backend.remove(globalPauseUntilKey());
  }

  /** No schedules to re-arm in memory; refreshes nothing by design. */
  async rearmAll(): Promise<void> {
    // Intentional no-op: in-memory state cannot decay.
  }

  /** Demo helpers for screens that show live blocking state. */
  isShielded(rule: BlockRule, now: number = Date.now()): boolean {
    if (rule.paused) {
      return false;
    }
    if (readGlobalPauseUntil(this.backend) !== null && readGlobalPauseUntil(this.backend)! > now) {
      return false;
    }
    if (rule.strictness === 'threshold') {
      return false; // usage counting is not simulated
    }
    return isInsideWindow(rule, now);
  }

  /** SF Symbol the real shield would show — keeps demo visuals in sync. */
  shieldIcon(rule: BlockRule): string {
    return shieldIconFor(rule);
  }
}
