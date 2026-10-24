/** Lock-screen activity (Live Activity) feature — public surface. */
export {
  endOfToday,
  isBlockingActivityActive,
  liveActivitySupport,
  startBlockingActivity,
  stopBlockingActivity,
  type BlockingActivityPayload,
  type LiveActivitySupport,
} from './api';
export { liveActivityStrings } from './strings';
export {
  LIVE_ACTIVITY_MODE_OPTIONS,
  activeBlock,
  blockEndsAt,
  blockPayload,
  dayPayload,
  decideLiveActivity,
  sameActivityPayload,
  syncBlockingActivity,
  type LiveActivityDecisionInput,
} from './controller';
export { useLiveActivitySync } from './useLiveActivitySync';
