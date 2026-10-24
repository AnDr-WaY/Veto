/**
 * React seam over the widget preferences: reads once on mount (sync — the
 * App Group suite is a synchronous UserDefaults read) and writes through on
 * every update. Only Settings edits these values, so no store subscription
 * is needed.
 */

import { useCallback, useState } from 'react';
import { libBackend } from '../blocking/appGroupStore';
import {
  readWidgetPreferences,
  writeWidgetPreferences,
  type WidgetPreferences,
} from './preferences';

export function useWidgetPreferences(): {
  preferences: WidgetPreferences;
  update: (patch: Partial<WidgetPreferences>) => void;
} {
  const [preferences, setPreferences] = useState<WidgetPreferences>(() =>
    readWidgetPreferences(libBackend),
  );

  const update = useCallback((patch: Partial<WidgetPreferences>) => {
    setPreferences(writeWidgetPreferences(libBackend, patch));
  }, []);

  return { preferences, update };
}
