/** Stats feature — public surface. */
export {
  type Interval,
  type StatsSummary,
  type AggregateStatsInput,
  overlapIntervals,
  mergeIntervals,
  subtractIntervals,
  sumIntervals,
  ruleWindowsInRange,
  pauseIntervalsFromEvents,
  computeStreak,
  aggregateStats,
} from './aggregate';
export { statsStrings } from './strings';
