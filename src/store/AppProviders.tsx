import React from 'react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../ui';
import { useSettingsStore } from './settingsStore';

/**
 * App-level providers fed from the persisted settings.
 *
 * Mount once in app/_layout.tsx around the Stack (integration step — the
 * layout file belongs to another zone). The ThemeProvider is keyed by the
 * persisted preference so a settings change re-resolves the palette
 * (including back to `system`).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((state) => state.settings.theme);
  return (
    <ThemeProvider key={theme} initial={theme}>
      {children}
    </ThemeProvider>
  );
}
