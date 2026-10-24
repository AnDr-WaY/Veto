import { create } from 'zustand';
import type { EventRecord } from '../core/contracts';
import { eventLog } from '../features/storage';
import { addDays, startOfDay } from '../lib/date';

/**
 * Stats store: keeps a rolling window of the event log (90 days — enough
 * for the 30-day summary plus streak look-back) and the selected summary
 * period. Aggregation itself is pure: src/features/stats/aggregate.ts.
 */

export type StatsPeriod = 'today' | 'last7' | 'last30';

/** How far back the rolling event cache reaches. */
export const STATS_WINDOW_DAYS = 90;

export function periodStart(period: StatsPeriod, nowMs: number): number {
  switch (period) {
    case 'today':
      return startOfDay(nowMs);
    case 'last7':
      return startOfDay(addDays(nowMs, -6));
    case 'last30':
      return startOfDay(addDays(nowMs, -29));
  }
}

export interface StatsState {
  /** Rolling event cache (up to 90 days back, ending now). */
  events: EventRecord[];
  loading: boolean;
  error: Error | null;
  period: StatsPeriod;
  setPeriod: (period: StatsPeriod) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useStatsStore = create<StatsState>()((set, get) => ({
  events: [],
  loading: false,
  error: null,
  period: 'today',

  setPeriod: async (period) => {
    set({ period });
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true });
    try {
      const now = Date.now();
      const from = startOfDay(addDays(now, -STATS_WINDOW_DAYS));
      const events = await eventLog.eventsBetween(from, now);
      set({ events, loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: error as Error });
    }
  },
}));
