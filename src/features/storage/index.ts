/**
 * Persistence layer — public surface.
 * Repositories implement the contracts from src/core/contracts.ts.
 */

export { type StringKV, MemoryKV, createKV, kv, MMKV_INSTANCE_ID, storageKind, storageError, storageSelfTest } from './kv';
export { STORAGE_KEYS, newId } from './keys';
export { MmkvRulesRepository } from './rulesRepo';
export {
  type LiveActivityMode,
  type ThemePreferenceValue,
  type VetoSettings,
  DEFAULT_VETO_SETTINGS,
  MmkvSettingsRepository,
} from './settingsRepo';
export {
  type EventMeta,
  type EventLogDriver,
  type SqliteDatabaseLike,
  MemoryEventLogDriver,
  SqliteEventLogDriver,
  EventLog,
  createEventLog,
  eventLog,
  EVENT_DB_NAME,
} from './eventLog';
export { resetAllData } from './reset';
