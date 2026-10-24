/**
 * Keeps the lock-screen activity in step with reality: fires the controller
 * on every applied-rule change (rules data seam — the same live-update path
 * the screens drive), on Live Activity setting changes (Ч5 store) and on
 * every app foreground (support can be flipped in the system Settings while
 * Veto sits in the background). Mounted once in the root layout.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRules } from '@/features/rules/hooks';
import { useSettingsStore } from '@/store';
import { syncBlockingActivity } from './controller';

export function useLiveActivitySync(): void {
  const { rules } = useRules();
  const liveActivityEnabled = useSettingsStore(
    (state) => state.settings.liveActivityEnabled,
  );
  const liveActivityModes = useSettingsStore(
    (state) => state.settings.liveActivityModes,
  );

  // Foreground syncs read the freshest rules without re-subscribing the
  // AppState listener — effects run in order, so the ref is current.
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    void syncBlockingActivity(rulesRef.current).catch(() => undefined);
  }, [rules, liveActivityEnabled, liveActivityModes]);

  useEffect(() => {
    void syncBlockingActivity(rulesRef.current).catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncBlockingActivity(rulesRef.current).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);
}
