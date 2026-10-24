import * as Haptics from 'expo-haptics';

/**
 * Fire-and-forget haptics wrapper. Never throws: haptics are best-effort,
 * and callers pass `enabled = settings.hapticsEnabled`.
 */

export type HapticKind = 'light' | 'success' | 'warning' | 'error';

export function haptic(kind: HapticKind = 'light', enabled: boolean = true): void {
  if (!enabled) return;

  try {
    switch (kind) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        break;
    }
  } catch {
    // no-op: unsupported platform or missing native module
  }
}
