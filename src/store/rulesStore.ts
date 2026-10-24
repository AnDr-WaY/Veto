import { create } from 'zustand';
import type { BlockRule, NewBlockRule } from '../core/contracts';
import { validateRule } from '../core/contracts';
import { MmkvRulesRepository, eventLog, newId, type EventMeta } from '../features/storage';
import { getEngine } from './engine';

/**
 * Rules store (zustand + MMKV): implements the contract's rule hooks.
 *
 * Engine interplay (mock until Ч3 lands): a rule is persisted only after
 * the engine accepted it, and removals propagate to the engine first —
 * storage never drifts from what is actually enforced on device.
 * Every mutation appends to the event log (rule_applied / rule_removed).
 */

export interface RulesState {
  rules: BlockRule[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  create: (input: NewBlockRule) => Promise<BlockRule>;
  update: (id: string, patch: Partial<BlockRule>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Storage-only delete (no engine teardown). For rules whose enforcement
   * is already over (expired one-shots): the full native remove() pipeline
   * (stopMonitoring/unblockSelection) aborts the app when it runs on a
   * launch dispatch queue — never call remove() from launch-path effects.
   */
  discard: (id: string) => Promise<void>;
}

const repo = new MmkvRulesRepository();

function sortRules(rules: BlockRule[]): BlockRule[] {
  return [...rules].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export const useRulesStore = create<RulesState>()((set, get) => ({
  rules: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const rules = await repo.list();
      set({ rules, loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: error as Error });
    }
  },

  create: async (input) => {
    const rule: BlockRule = {
      ...input,
      id: newId('rule'),
      paused: false,
      createdAt: Date.now(),
    };
    const problems = validateRule(rule);
    if (problems.length > 0) {
      throw new Error(problems.join('; '));
    }
    await getEngine().apply(rule);
    await repo.save(rule);
    await eventLog.record('rule_applied', rule.id, {
      title: rule.title,
    } satisfies EventMeta);
    set({ rules: sortRules([...get().rules, rule]), error: null });
    return rule;
  },

  update: async (id, patch) => {
    const existing = get().rules.find((rule) => rule.id === id);
    if (!existing) {
      throw new Error(`unknown rule: ${id}`);
    }
    const next: BlockRule = { ...existing, ...patch };
    const problems = validateRule(next);
    if (problems.length > 0) {
      throw new Error(problems.join('; '));
    }
    // Re-apply so the engine re-arms the schedule for the edited rule.
    await getEngine().apply(next);
    await repo.save(next);
    await eventLog.record('rule_applied', id, {
      title: next.title,
      rearmed: true,
    } satisfies EventMeta);
    set({
      rules: sortRules(get().rules.map((rule) => (rule.id === id ? next : rule))),
      error: null,
    });
  },

  remove: async (id) => {
    const existing = get().rules.find((rule) => rule.id === id);
    await getEngine().remove(id);
    await repo.remove(id);
    await eventLog.record('rule_removed', id, {
      title: existing?.title ?? '',
    } satisfies EventMeta);
    set({ rules: get().rules.filter((rule) => rule.id !== id), error: null });
  },

  discard: async (id) => {
    await repo.remove(id);
    set({ rules: get().rules.filter((rule) => rule.id !== id), error: null });
  },
}));

export const rulesRepoForTests = repo;
