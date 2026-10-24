/**
 * Storage keys and id generation for the persistence layer.
 * Versioned keys — a future schema bump adds a new key and migrates.
 */

export const STORAGE_KEYS = {
  /** JSON map of BlockRule by id (MMKV). */
  rules: 'veto.rules.v1',
  /** JSON object of VetoSettings (MMKV). */
  settings: 'veto.settings.v1',
  /** JSON onboarding flag ({ done, readOnly }) (MMKV). */
  onboarding: 'veto.onboarding.v1',
} as const;

/** Compact collision-safe id: prefix + base36 time + 4 random chars. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${time}${rand}`;
}
