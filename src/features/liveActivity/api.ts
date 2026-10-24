/**
 * Lock-screen activity (iOS Live Activity) JS seam.
 *
 * The native side is the local Expo module in `modules/veto-live-activity`
 * (ActivityKit): `start` opens the activity with a title + a countdown
 * target, `stop` ends it. The activity UI itself lives in the DayLeftWidget
 * extension (targets/DayLeftWidget/BlockingActivity.swift).
 *
 * Like every native touchpoint this degrades outside a dev-client build:
 * Expo Go cannot host the custom module, so `requireOptionalNativeModule`
 * returns null and every call becomes a safe no-op — `liveActivitySupport()`
 * then reports `missing` and screens hide their Live Activity UI.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';
import { isExpoGo } from '../../core/environment';

/** Everything the lock-screen card shows. `endsAt` is epoch ms. */
export interface BlockingActivityPayload {
  title: string;
  endsAt: number;
}

/**
 * Must stay in sync with modules/veto-live-activity/ios/VetoLiveActivityModule.swift
 * (function names and argument order).
 */
interface NativeLiveActivityModule {
  start: (title: string, endsAt: number) => Promise<boolean>;
  stop: () => Promise<boolean>;
  isActive: () => boolean;
  isAvailable: () => boolean;
}

const NATIVE_MODULE_NAME = 'VetoLiveActivity';

function tryRequireNative(): NativeLiveActivityModule | null {
  try {
    return requireOptionalNativeModule<NativeLiveActivityModule>(NATIVE_MODULE_NAME);
  } catch {
    return null;
  }
}

const native = isExpoGo() ? null : tryRequireNative();

/**
 * Why the lock-screen activity may not be startable right now:
 *
 * - `missing` — no native module in the binary (Expo Go, or a build without
 *   the module): screens hide their Live Activity UI instead of showing a
 *   dead toggle.
 * - `disabled` — the module runs, but Live Activities are switched off
 *   system-wide or per-app (iOS Settings → Veto → Live Activities): screens
 *   keep the UI and point the way.
 * - `ready` — the activity can be started immediately.
 */
export type LiveActivitySupport = 'missing' | 'disabled' | 'ready';

/**
 * Distinguishes "no native module" from "module present but Live Activities
 * switched off" — the Settings row hides in the first case and shows guidance
 * in the second. Re-checked on demand: the user can flip Live Activities in
 * the system Settings while Veto sits in the background, so callers re-run
 * this when the app returns to the foreground.
 */
export function liveActivitySupport(): LiveActivitySupport {
  if (!native) {
    return 'missing';
  }
  try {
    return native.isAvailable() === true ? 'ready' : 'disabled';
  } catch {
    // The module answers but the availability probe failed — treat it as
    // switched off rather than absent, so guidance stays instead of the
    // row silently vanishing.
    return 'disabled';
  }
}

/** Start (or restart) the lock-screen activity. False = not possible now. */
export async function startBlockingActivity(payload: BlockingActivityPayload): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return (await native.start(payload.title, payload.endsAt)) === true;
  } catch {
    return false;
  }
}

/** End the activity immediately. False = nothing to end (or unsupported). */
export async function stopBlockingActivity(): Promise<boolean> {
  if (!native) {
    return false;
  }
  try {
    return (await native.stop()) === true;
  } catch {
    return false;
  }
}

/** True while the lock-screen activity is on screen. */
export function isBlockingActivityActive(): boolean {
  if (!native) {
    return false;
  }
  try {
    return native.isActive() === true;
  } catch {
    return false;
  }
}

/** End of today, local time (epoch ms) — the default countdown target. */
export function endOfToday(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}
