/** Store layer — public surface. */
export { getEngine } from './engine';
export { useSettingsStore, type SettingsState, settingsRepoForTests } from './settingsStore';
export { useRulesStore, type RulesState, rulesRepoForTests } from './rulesStore';
export {
  useStatsStore,
  type StatsState,
  type StatsPeriod,
  STATS_WINDOW_DAYS,
  periodStart,
} from './statsStore';
export {
  useRules,
  useRuleActions,
  useStats,
  useSettings,
  useVetoSettings,
  useGlobalPause,
  useStatsSummary,
  type StatsSummaryResult,
} from './hooks';
export { AppProviders } from './AppProviders';
