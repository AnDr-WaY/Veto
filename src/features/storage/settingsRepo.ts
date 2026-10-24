import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type SettingsRepository,
} from '../../core/contracts';
import { type StringKV, kv } from './kv';
import { STORAGE_KEYS } from './keys';

/** Theme preference — mirrors the design system's ThemeProvider values. */
export type ThemePreferenceValue = 'system' | 'light' | 'dark';

/** What the lock-screen activity counts down to (Live Activity controller). */
export type LiveActivityMode = 'block' | 'day' | 'both';

/**
 * Full app settings persisted in MMKV.
 *
 * Extends the contract's AppSettings (globalPausedUntil, hapticsEnabled)
 * with the E6 settings surface: theme and block notifications toggles.
 */
export interface VetoSettings extends AppSettings {
  theme: ThemePreferenceValue;
  /** Notify when a scheduled block starts (delivery is wired by Ч6). */
  notifyOnBlockStart: boolean;
  /** Notify when a scheduled block ends (delivery is wired by Ч6). */
  notifyOnBlockEnd: boolean;
  /** Lock-screen activity feature switch (the controller starts/stops on sync). */
  liveActivityEnabled: boolean;
  /** What the activity counts down to; a running block overrides the day. */
  liveActivityModes: LiveActivityMode;
}

export const DEFAULT_VETO_SETTINGS: VetoSettings = {
  ...DEFAULT_SETTINGS,
  theme: 'system',
  notifyOnBlockStart: true,
  notifyOnBlockEnd: false,
  liveActivityEnabled: false,
  liveActivityModes: 'both',
};

const THEMES: readonly ThemePreferenceValue[] = ['system', 'light', 'dark'];
const LIVE_ACTIVITY_MODES: readonly LiveActivityMode[] = ['block', 'day', 'both'];

function sanitize(raw: unknown): VetoSettings {
  const merged: VetoSettings = { ...DEFAULT_VETO_SETTINGS };
  if (raw === null || typeof raw !== 'object') {
    return merged;
  }
  const source = raw as Record<string, unknown>;

  if ('globalPausedUntil' in source) {
    const value = source.globalPausedUntil;
    merged.globalPausedUntil = typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (typeof source.hapticsEnabled === 'boolean') {
    merged.hapticsEnabled = source.hapticsEnabled;
  }
  if (typeof source.theme === 'string' && THEMES.includes(source.theme as ThemePreferenceValue)) {
    merged.theme = source.theme as ThemePreferenceValue;
  }
  if (typeof source.notifyOnBlockStart === 'boolean') {
    merged.notifyOnBlockStart = source.notifyOnBlockStart;
  }
  if (typeof source.notifyOnBlockEnd === 'boolean') {
    merged.notifyOnBlockEnd = source.notifyOnBlockEnd;
  }
  if (typeof source.liveActivityEnabled === 'boolean') {
    merged.liveActivityEnabled = source.liveActivityEnabled;
  }
  if (
    typeof source.liveActivityModes === 'string' &&
    LIVE_ACTIVITY_MODES.includes(source.liveActivityModes as LiveActivityMode)
  ) {
    merged.liveActivityModes = source.liveActivityModes as LiveActivityMode;
  }

  return merged;
}

/**
 * MMKV-backed SettingsRepository (contract: src/core/contracts.ts).
 *
 * The contract surface (get/set over AppSettings) is a subset view of the
 * full VetoSettings stored on disk; use getFull/setFull for the extended
 * fields (theme, notifications).
 */
export class MmkvSettingsRepository implements SettingsRepository {
  private readonly store: StringKV;
  private readonly key: string;

  constructor(store: StringKV = kv, key: string = STORAGE_KEYS.settings) {
    this.store = store;
    this.key = key;
  }

  /** Synchronous read — MMKV is sync, so stores hydrate without flicker. */
  readSync(): VetoSettings {
    const raw = this.store.getString(this.key);
    if (!raw) {
      return { ...DEFAULT_VETO_SETTINGS };
    }
    try {
      return sanitize(JSON.parse(raw));
    } catch (error) {
      console.error(`[storage] settings "${this.key}" failed to parse — using defaults`, error);
      return { ...DEFAULT_VETO_SETTINGS };
    }
  }

  async get(): Promise<AppSettings> {
    return this.readSync();
  }

  async getFull(): Promise<VetoSettings> {
    return this.readSync();
  }

  async set(patch: Partial<AppSettings>): Promise<void> {
    await this.setFull(patch);
  }

  async setFull(patch: Partial<VetoSettings>): Promise<void> {
    const next = sanitize({ ...this.readSync(), ...patch });
    this.store.set(this.key, JSON.stringify(next));
  }
}
