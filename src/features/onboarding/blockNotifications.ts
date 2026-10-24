/**
 * Block start/end notifications (expo-notifications).
 *
 * Delivery is wired by Ч6: the settings screen (Ч5) owns the toggles
 * (`notifyOnBlockStart` / `notifyOnBlockEnd` in VetoSettings), this module
 * owns turning them into scheduled local notifications that follow the
 * rules' schedules.
 *
 * Pure planning lives in `planBlockNotifications` (unit-testable). The native
 * module is loaded through a guarded lexical `require` — under jest, Expo Go
 * and unsupported platforms everything degrades to a no-op, exactly like the
 * persistence layer's memory fallback.
 */

import type { BlockRule } from '@/core/contracts';
import type { SchedulableNotificationTriggerInput } from 'expo-notifications';
import { minutesToHHMM } from '@/lib/time';

/** EN copy for block start/end notifications (lives with its feature). */
const notificationCopy = {
  startTitle: 'Block started',
  startBody: (title: string, until: string) => `${title} — blocked until ${until}`,
  endTitle: 'Block ended',
  endBody: (title: string) => `${title} is available again`,
} as const;

/** Every Veto-scheduled block notification id starts with this prefix. */
export const BLOCK_NOTIFICATION_PREFIX = 'veto-block-';

/** Subset of VetoSettings that drives delivery. */
export interface BlockNotificationSettings {
  notifyOnBlockStart: boolean;
  notifyOnBlockEnd: boolean;
}

export type BlockNotificationKind = 'start' | 'end';

export interface PlannedBlockNotification {
  id: string;
  kind: BlockNotificationKind;
  ruleId: string;
  title: string;
  body: string;
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
  /** expo-notifications weekday: 1 = Sunday … 7 = Saturday. */
  weekday?: number;
}

/** JS weekday (0 = Sunday) → expo-notifications weekly trigger (1 = Sunday). */
function expoWeekday(day: number): number {
  return day + 1;
}

function occurrences(rule: BlockRule): number[] | undefined {
  return rule.days === 'daily' ? undefined : rule.days.map(expoWeekday);
}

function planFor(
  rule: BlockRule,
  kind: BlockNotificationKind,
  minutes: number,
  weekday: number | undefined,
): PlannedBlockNotification {
  const copy = notificationCopy;
  const until = minutesToHHMM(rule.endMin);
  const inDay = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return {
    id: `${BLOCK_NOTIFICATION_PREFIX}${kind}-${rule.id}-${weekday ?? 'daily'}`,
    kind,
    ruleId: rule.id,
    hour: Math.floor(inDay / 60),
    minute: inDay % 60,
    weekday,
    title: kind === 'start' ? copy.startTitle : copy.endTitle,
    body:
      kind === 'start'
        ? copy.startBody(rule.title, until)
        : copy.endBody(rule.title),
  };
}

/**
 * Pure planner: which repeating notifications should exist right now for the
 * given rules and toggles. Paused rules never notify; a block that ends at
 * midnight (1440) is announced at 00:00.
 */
export function planBlockNotifications(
  rules: readonly BlockRule[],
  settings: BlockNotificationSettings,
): PlannedBlockNotification[] {
  const plans: PlannedBlockNotification[] = [];
  for (const rule of rules) {
    if (rule.paused) {
      continue;
    }
    const weekdays = occurrences(rule);
    if (settings.notifyOnBlockStart) {
      for (const weekday of weekdays ?? [undefined]) {
        plans.push(planFor(rule, 'start', rule.startMin, weekday));
      }
    }
    if (settings.notifyOnBlockEnd) {
      // An overnight window ends on the day after its start day.
      const wrap = rule.endMin < rule.startMin && rule.endMin > 0;
      for (const weekday of weekdays ?? [undefined]) {
        const endWeekday =
          wrap && weekday !== undefined ? (weekday % 7) + 1 : weekday;
        plans.push(planFor(rule, 'end', rule.endMin, endWeekday));
      }
    }
  }
  return plans;
}

function triggerFor(plan: PlannedBlockNotification): SchedulableNotificationTriggerInput {
  // The enum member values are exactly these strings, but the generated
  // `type` field is typed as the enum, so the literal shape needs the cast.
  const trigger: {
    type: string;
    hour: number;
    minute: number;
    weekday?: number;
  } =
    plan.weekday === undefined
      ? { type: 'daily', hour: plan.hour, minute: plan.minute }
      : { type: 'weekly', weekday: plan.weekday, hour: plan.hour, minute: plan.minute };
  return trigger as unknown as SchedulableNotificationTriggerInput;
}

// ---------------------------------------------------------------------------
// Native surface (guarded — the module may be absent in jest / Expo Go)
// ---------------------------------------------------------------------------

type ExpoNotifications = typeof import('expo-notifications');

let cached: ExpoNotifications | null | undefined;

/** True when the native notifications module is usable in this context. */
function tryLoadNotifications(): ExpoNotifications | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    // Literal relative specifier so Metro keeps the module in the bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as ExpoNotifications;
  } catch {
    cached = null;
  }
  return cached;
}

try {
  const notifications = tryLoadNotifications();
  if (notifications) {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
} catch {
  // Handler setup is best-effort; scheduling still works.
}

/**
 * Ask for notification permission once (call inside a user-gesture flow).
 * Returns false when unsupported or denied — the app keeps working without
 * notifications.
 */
export async function ensureNotificationPermissionAsync(): Promise<boolean> {
  const notifications = tryLoadNotifications();
  if (!notifications) {
    return false;
  }
  try {
    const current = await notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    if (current.canAskAgain === false) {
      return false;
    }
    const requested = await notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  } catch {
    return false;
  }
}

/**
 * Reconcile the scheduled block notifications with the current rules and
 * toggles: cancels every Veto-scheduled notification, then schedules the
 * fresh plan. No-op without the native module.
 */
export async function syncBlockNotifications(
  rules: readonly BlockRule[],
  settings: BlockNotificationSettings,
): Promise<void> {
  const notifications = tryLoadNotifications();
  if (!notifications) {
    return;
  }
  const planned = planBlockNotifications(rules, settings);
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.identifier.startsWith(BLOCK_NOTIFICATION_PREFIX)) {
      await notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
  for (const plan of planned) {
    await notifications.scheduleNotificationAsync({
      identifier: plan.id,
      content: {
        title: plan.title,
        body: plan.body,
        sound: false,
      },
      trigger: triggerFor(plan),
    });
  }
}
