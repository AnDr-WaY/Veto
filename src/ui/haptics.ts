/**
 * Haptics adapter for UI components (owned by the design-system chapter).
 * Lazily loads expo-haptics and silently no-ops when it is unavailable
 * (jest, web, Expo Go) so components stay renderable everywhere.
 *
 * Brand rule: short "tick" haptics on taps — light selection feedback,
 * never aggressive long vibrations.
 */

// Module-scoped declaration so the lazy require() typechecks without @types/node.
declare const require: (moduleId: string) => unknown;

interface ExpoHapticsLike {
  selectionAsync?: () => Promise<void>;
  impactAsync?: (style: number) => Promise<void>;
  notificationAsync?: (type: number) => Promise<void>;
  ImpactFeedbackStyle?: {Light: number; Medium: number; Heavy: number};
  NotificationFeedbackType?: {Success: number; Warning: number; Error: number};
}

let cached: ExpoHapticsLike | null | undefined;

function load(): ExpoHapticsLike | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    cached = require('expo-haptics') as ExpoHapticsLike;
  } catch {
    cached = null;
  }
  return cached;
}

function safe(run: () => Promise<void> | void): void {
  try {
    void Promise.resolve(run()).catch(() => undefined);
  } catch {
    // Haptics must never break a press.
  }
}

export const haptics = {
  /** Selection tick — chips, steppers, pickers. */
  tick(): void {
    const mod = load();
    if (mod?.selectionAsync) {
      safe(() => mod.selectionAsync!());
    }
  },
  /** Light tap — buttons, FAB. */
  tap(): void {
    const mod = load();
    if (mod?.impactAsync && mod.ImpactFeedbackStyle) {
      const style = mod.ImpactFeedbackStyle.Light;
      safe(() => mod.impactAsync!(style));
    }
  },
  /** Heavy confirmation — arming/blocking actions. */
  thud(): void {
    const mod = load();
    if (mod?.impactAsync && mod.ImpactFeedbackStyle) {
      const style = mod.ImpactFeedbackStyle.Heavy;
      safe(() => mod.impactAsync!(style));
    }
  },
  /** Success notification — completed state change. */
  confirm(): void {
    const mod = load();
    if (mod?.notificationAsync && mod.NotificationFeedbackType) {
      const type = mod.NotificationFeedbackType.Success;
      safe(() => mod.notificationAsync!(type));
    }
  },
};
