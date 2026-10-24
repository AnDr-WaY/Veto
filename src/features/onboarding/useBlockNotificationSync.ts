/**
 * Keeps the scheduled block notifications in sync with the live rules
 * (rules data seam) and the settings toggles (Ч5 store). Mounted once in
 * the root layout — it re-runs whenever rules or toggles change.
 */

import { useEffect } from 'react';
import { useRules } from '@/features/rules/hooks';
import { useSettingsStore } from '@/store';
import { syncBlockNotifications } from './blockNotifications';

export function useBlockNotificationSync(): void {
  const { rules } = useRules();
  const notifyOnBlockStart = useSettingsStore(
    (state) => state.settings.notifyOnBlockStart,
  );
  const notifyOnBlockEnd = useSettingsStore(
    (state) => state.settings.notifyOnBlockEnd,
  );

  useEffect(() => {
    void syncBlockNotifications(rules, { notifyOnBlockStart, notifyOnBlockEnd }).catch(
      () => undefined,
    );
  }, [rules, notifyOnBlockStart, notifyOnBlockEnd]);
}
