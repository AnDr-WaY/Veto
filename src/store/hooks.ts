import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  RuleActions,
  UseRulesResult,
  UseSettingsResult,
  UseStatsResult,
  UseGlobalPauseResult,
} from '../core/contracts';
import { aggregateStats, type StatsSummary } from '../features/stats';
import type { VetoSettings } from '../features/storage';
import { useRulesStore } from './rulesStore';
import { useSettingsStore } from './settingsStore';
import { periodStart, useStatsStore, type StatsPeriod } from './statsStore';

/**
 * Contract hooks (src/core/contracts.ts) backed by the zustand stores.
 * Screens consume only these — never the stores directly — so the data
 * layer stays swappable.
 */

export function useRules(): UseRulesResult {
  const rules = useRulesStore((state) => state.rules);
  const loading = useRulesStore((state) => state.loading);
  const error = useRulesStore((state) => state.error);
  const refresh = useRulesStore((state) => state.refresh);
  return { rules, loading, error, refresh };
}

export function useRuleActions(): RuleActions {
  const create = useRulesStore((state) => state.create);
  const update = useRulesStore((state) => state.update);
  const remove = useRulesStore((state) => state.remove);
  return useMemo(() => ({ create, update, remove }), [create, update, remove]);
}

export function useStats(): UseStatsResult {
  const events = useStatsStore((state) => state.events);
  const loading = useStatsStore((state) => state.loading);
  const refresh = useStatsStore((state) => state.refresh);
  return { events, loading, refresh };
}

export function useSettings(): UseSettingsResult {
  const settings = useSettingsStore((state) => state.settings);
  const loading = useSettingsStore((state) => state.loading);
  const update = useSettingsStore((state) => state.update);
  return { settings, loading, update };
}

/** Full (E6) settings surface — typed superset of the contract hook. */
export function useVetoSettings(): {
  settings: VetoSettings;
  loading: boolean;
  update: (patch: Partial<VetoSettings>) => Promise<void>;
} {
  const settings = useSettingsStore((state) => state.settings);
  const loading = useSettingsStore((state) => state.loading);
  const update = useSettingsStore((state) => state.update);
  return { settings, loading, update };
}

const PAUSE_TICK_MS = 15_000;

export function useGlobalPause(): UseGlobalPauseResult {
  const pausedUntil = useSettingsStore((state) => state.settings.globalPausedUntil);
  const pause = useSettingsStore((state) => state.pause);
  const resume = useSettingsStore((state) => state.resume);
  const tickPause = useSettingsStore((state) => state.tickPause);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      tickPause();
    }, PAUSE_TICK_MS);
    return () => clearInterval(id);
  }, [tickPause]);

  const isPaused = pausedUntil !== null && now < pausedUntil;
  return { pausedUntil, isPaused, pause, resume };
}

export interface StatsSummaryResult {
  summary: StatsSummary;
  loading: boolean;
  period: StatsPeriod;
  setPeriod: (period: StatsPeriod) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Live E5 summary for the stats screen (see src/features/stats). */
export function useStatsSummary(): StatsSummaryResult {
  const events = useStatsStore((state) => state.events);
  const loading = useStatsStore((state) => state.loading);
  const period = useStatsStore((state) => state.period);
  const setPeriod = useStatsStore((state) => state.setPeriod);
  const refreshStats = useStatsStore((state) => state.refresh);

  const rules = useRulesStore((state) => state.rules);
  const refreshRules = useRulesStore((state) => state.refresh);

  const pausedUntil = useSettingsStore((state) => state.settings.globalPausedUntil);

  // Re-render every 30 s so "today" numbers stay fresh on a static screen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const summary = useMemo(
    () =>
      aggregateStats({
        events,
        rules,
        fromMs: periodStart(period, now),
        toMs: now,
        nowMs: now,
        currentPausedUntil: pausedUntil,
      }),
    [events, rules, period, now, pausedUntil],
  );

  const refresh = useCallback(async () => {
    await Promise.all([refreshStats(), refreshRules()]);
  }, [refreshStats, refreshRules]);

  return { summary, loading, period, setPeriod, refresh };
}
