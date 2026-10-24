/**
 * Hook implementations for the Ч1 contract (UseRules / UseRuleActions).
 *
 * Screens never touch repositories or the engine directly — they call these
 * hooks, which delegate to the backend from './data'. Until the real store
 * (Ч5) is configured, that backend is the in-memory mock, so the whole UI
 * works in demo mode out of the box.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { validateRule } from '@/core/contracts';
import type { BlockRule, RuleActions, UseRulesResult } from '@/core/contracts';
import { getRulesBackend } from './data';

function createRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Engine failures must never break rule management — swallow and move on. */
async function applyQuietly(
  engine: ReturnType<typeof getRulesBackend>['engine'],
  rule: BlockRule,
): Promise<void> {
  if (!engine) {
    return;
  }
  try {
    await engine.apply(rule);
  } catch {
    // The rule is safely stored; the engine can be re-armed later.
  }
}

export function useRules(): UseRulesResult {
  const backend = getRulesBackend();
  const [rules, setRules] = useState<BlockRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await backend.repository.list();
      setRules(list);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    // Initial load is an async repository round-trip: the setStates inside
    // `refresh` fire after the await, never during the effect pass — the
    // compiler lint can't see through the await boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Live updates: repositories notify on mutation (contract-optional), so
    // a pause or edit lands on screen in the same tick — no polling.
    const unsubscribe = backend.repository.subscribe?.(() => {
      void refresh();
    });
    return unsubscribe;
  }, [backend, refresh]);

  return { rules, loading, error, refresh };
}

export function useRuleActions(): RuleActions {
  const backend = getRulesBackend();

  return useMemo(
    () => ({
      async create(input) {
        const rule: BlockRule = {
          ...input,
          id: createRuleId(),
          paused: false,
          createdAt: Date.now(),
        };
        const problems = validateRule(rule);
        if (problems.length > 0) {
          throw new Error(`Invalid rule: ${problems.join('; ')}`);
        }
        await backend.repository.save(rule);
        await applyQuietly(backend.engine, rule);
        return rule;
      },

      async update(id, patch) {
        const current = await backend.repository.get(id);
        if (!current) {
          throw new Error(`Rule not found: ${id}`);
        }
        const next: BlockRule = { ...current, ...patch };
        const problems = validateRule(next);
        if (problems.length > 0) {
          throw new Error(`Invalid rule: ${problems.join('; ')}`);
        }
        await backend.repository.save(next);
        await applyQuietly(backend.engine, next);
      },

      async remove(id) {
        await backend.repository.remove(id);
        if (backend.engine) {
          try {
            await backend.engine.remove(id);
          } catch {
            // Best-effort disarm; the rule is already gone from the store.
          }
        }
      },
    }),
    [backend],
  );
}
