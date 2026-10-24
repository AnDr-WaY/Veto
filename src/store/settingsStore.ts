import { create } from 'zustand';
import {
  DEFAULT_VETO_SETTINGS,
  MmkvSettingsRepository,
  eventLog,
  type EventMeta,
  type VetoSettings,
} from '../features/storage';
import { getEngine } from './engine';

/**
 * Settings + global pause store (zustand + MMKV).
 *
 * Hydrates synchronously from MMKV, so `settings` is never null — the
 * contract's `UseSettingsResult` still holds (VetoSettings extends
 * AppSettings, loading stays false after the sync hydration).
 *
 * Global pause is persisted in settings (`globalPausedUntil`) and mirrored
 * to the blocking engine + the event log (`paused` / `resumed` events).
 */

export interface SettingsState {
  settings: VetoSettings;
  /** True while a write is in flight. */
  loading: boolean;
  update: (patch: Partial<VetoSettings>) => Promise<void>;
  /** Pause every rule for `durationMin` minutes. */
  pause: (durationMin: number) => Promise<void>;
  /** Lift the global pause immediately. */
  resume: () => Promise<void>;
  /**
   * Clears an expired pause (called from hooks on an interval); appends an
   * automatic `resumed` event so stats see the real pause interval.
   */
  tickPause: () => void;
  /** Back to DEFAULT_VETO_SETTINGS (storage itself is wiped by resetAllData). */
  reset: () => void;
}

const repo = new MmkvSettingsRepository();

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: repo.readSync(),
  loading: false,

  update: async (patch) => {
    set({ loading: true });
    try {
      await repo.setFull(patch);
      set({ settings: { ...get().settings, ...patch } });
    } finally {
      set({ loading: false });
    }
  },

  pause: async (durationMin) => {
    const minutes = Math.max(1, Math.trunc(durationMin));
    const until = Date.now() + minutes * 60_000;
    await getEngine().pauseAll(minutes);
    await repo.setFull({ globalPausedUntil: until });
    await eventLog.record('paused', null, { minutes } satisfies EventMeta);
    set({ settings: { ...get().settings, globalPausedUntil: until } });
  },

  resume: async () => {
    await getEngine().resumeAll();
    await repo.setFull({ globalPausedUntil: null });
    await eventLog.record('resumed');
    set({ settings: { ...get().settings, globalPausedUntil: null } });
  },

  tickPause: () => {
    const current = get().settings.globalPausedUntil;
    if (current === null || Date.now() < current) {
      return;
    }
    void (async () => {
      await getEngine().resumeAll();
      await repo.setFull({ globalPausedUntil: null });
      await eventLog.record('resumed', null, { auto: true } satisfies EventMeta);
      if (get().settings.globalPausedUntil !== null) {
        set({ settings: { ...get().settings, globalPausedUntil: null } });
      }
    })();
  },

  reset: () => {
    set({ settings: { ...DEFAULT_VETO_SETTINGS }, loading: false });
  },
}));

export const settingsRepoForTests = repo;
export { DEFAULT_VETO_SETTINGS };
