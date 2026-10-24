import type { BlockRule, RulesRepository } from '../../core/contracts';
import { validateRule } from '../../core/contracts';
import { type StringKV, kv } from './kv';
import { STORAGE_KEYS } from './keys';

type RuleMap = Record<string, BlockRule>;
type Listener = () => void;

/**
 * Read-time migration: the skip mechanic ('soft' strictness + grace
 * bookkeeping) is gone — stored rules from older builds degrade to 'hard'
 * and lose the legacy fields, so the rest of the app never sees them.
 */
function normalizeRule(raw: BlockRule): BlockRule {
  const rule: BlockRule = { ...raw };
  const legacy = rule as unknown as Record<string, unknown>;
  delete legacy.graceMin;
  delete legacy.dailyGraceLimit;
  if ((rule.strictness as unknown as string) === 'soft') {
    rule.strictness = 'hard';
  }
  return rule;
}

/**
 * MMKV-backed RulesRepository (contract: src/core/contracts.ts).
 * Rules live as a single JSON map keyed by rule id; writes are atomic per
 * key, so no partial-state window exists. Invalid rules are rejected on
 * save — storage never persists a rule the engine would refuse.
 *
 * Like the in-memory demo repository, every mutation notifies subscribers
 * (non-contract extra): useRules() live-updates from these emissions, so a
 * pause or edit is on screen in the same tick — no polling, no refocus.
 */
export class MmkvRulesRepository implements RulesRepository {
  private readonly store: StringKV;
  private readonly key: string;
  private readonly listeners = new Set<Listener>();

  constructor(store: StringKV = kv, key: string = STORAGE_KEYS.rules) {
    this.store = store;
    this.key = key;
  }

  private readMap(): RuleMap {
    const raw = this.store.getString(this.key);
    if (!raw) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.error(`[storage] rules "${this.key}" held a ${typeof parsed} — treating as empty`);
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed as RuleMap).map(([id, rule]) => [id, normalizeRule(rule)]),
      );
    } catch (error) {
      // Stored JSON must never fail silently: an empty map here looks like
      // "all blocks vanished" on screen.
      console.error(`[storage] rules "${this.key}" failed to parse — treating as empty`, error);
      return {};
    }
  }

  private writeMap(map: RuleMap): void {
    this.store.set(this.key, JSON.stringify(map));
  }

  async list(): Promise<BlockRule[]> {
    return Object.values(this.readMap()).sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  }

  async get(id: string): Promise<BlockRule | null> {
    return this.readMap()[id] ?? null;
  }

  async save(rule: BlockRule): Promise<void> {
    const problems = validateRule(rule);
    if (problems.length > 0) {
      throw new Error(`invalid rule: ${problems.join('; ')}`);
    }
    const map = this.readMap();
    map[rule.id] = rule;
    this.writeMap(map);
    this.emit();
  }

  async remove(id: string): Promise<void> {
    const map = this.readMap();
    if (id in map) {
      delete map[id];
      this.writeMap(map);
      this.emit();
    }
  }

  /** Non-contract extra: lets useRules() live-update without polling. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
