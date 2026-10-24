/**
 * "Reset all data" (Settings → Developer): the buildless "reinstall" for
 * Expo Go. Wipes every persisted artifact — KV keys (rules, settings and
 * the legacy onboarding flag) and the event log — and resets the live
 * zustand stores so open screens re-render empty.
 *
 * Every step is best-effort (a wipe failure must never crash the app) and
 * runs through the shared `kv` / `eventLog` singletons, so it works on MMKV
 * and on the MemoryKV fallback (Expo Go, jest) alike.
 */

import { kv } from './kv';
import { STORAGE_KEYS } from './keys';
import { eventLog } from './eventLog';
import { useRulesStore } from '../../store/rulesStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useStatsStore } from '../../store/statsStore';

/** All KV keys the app persists (see STORAGE_KEYS). */
const APP_KV_KEYS: readonly string[] = [
  STORAGE_KEYS.rules,
  STORAGE_KEYS.settings,
  STORAGE_KEYS.onboarding,
];

/**
 * Full app wipe. Awaitable so callers (and tests) observe the refreshed
 * stores once it resolves; the store refreshes never throw.
 */
export async function resetAllData(): Promise<void> {
  // 1. Live settings store first: open screens re-render default toggles.
  useSettingsStore.getState().reset();

  // 2. Persisted KV artifacts (rules, settings, legacy onboarding flag).
  for (const key of APP_KV_KEYS) {
    try {
      kv.delete(key);
    } catch {
      // Best-effort wipe.
    }
  }

  // 3. Event log (sqlite in production builds, memory fallback elsewhere).
  try {
    eventLog.clear();
  } catch {
    // Best-effort wipe.
  }

  // 4. Re-read the now-empty storage so open screens re-render empty.
  await useRulesStore.getState().refresh();
  await useStatsStore.getState().refresh();
}
