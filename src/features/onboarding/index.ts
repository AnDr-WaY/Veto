/**
 * Public surface of what remains of the onboarding feature: the intro flow
 * itself was removed (the app opens straight to Home) — only the block
 * notification permission/planning keeps living here. Screens and the root
 * layout import from this barrel.
 */

export {
  BLOCK_NOTIFICATION_PREFIX,
  ensureNotificationPermissionAsync,
  planBlockNotifications,
  syncBlockNotifications,
  type PlannedBlockNotification,
} from './blockNotifications';
export { useBlockNotificationSync } from './useBlockNotificationSync';
