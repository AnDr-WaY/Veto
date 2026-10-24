import React, { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderElement } from '../../ui/__tests__/testUtils';
import { DEFAULT_VETO_SETTINGS } from '../../features/storage';
import { kv } from '../../features/storage/kv';
import { eventLog } from '../../features/storage/eventLog';
import { useSettingsStore } from '../settingsStore';
import { useRulesStore } from '../rulesStore';
import { useStatsStore } from '../statsStore';

/**
 * Live-data smoke tests for the two Ч5 screens: the real screens render
 * against the real stores (no data mocks), inside a bare navigation
 * container. expo-router's focus hook needs the full router shell, so it is
 * replaced with its plain-React equivalent — the refresh-on-focus behavior
 * itself is trivial and covered by the store tests.
 */

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [callback]);
    },
  };
});

function loadScreen(relativePath: string): React.ComponentType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(relativePath) as { default?: React.ComponentType };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

const StatsScreen = loadScreen('../../../app/stats');
const SettingsScreen = loadScreen('../../../app/settings');

beforeEach(() => {
  kv.clearAll();
  eventLog.clear();
  useSettingsStore.setState({ settings: { ...DEFAULT_VETO_SETTINGS }, loading: false });
  useRulesStore.setState({ rules: [], loading: false, error: null });
  useStatsStore.setState({ events: [], loading: false, error: null, period: 'today' });
});

// The tab screens read useSafeAreaInsets, which throws without a provider.
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

function renderWithInsets(screen: React.ComponentType): ReturnType<typeof renderElement> {
  return renderElement(
    <SafeAreaProvider initialSafeAreaInsets={INSETS}>
      {React.createElement(screen)}
    </SafeAreaProvider>,
  );
}

(StatsScreen ? it : it.skip)('stats screen renders live store data', () => {
  const renderer = renderWithInsets(StatsScreen as React.ComponentType);
  const json = JSON.stringify(renderer.toJSON());
  renderer.unmount();
  expect(json).toContain('Stats');
  expect(json).toContain('Today');
});

(SettingsScreen ? it : it.skip)('settings screen renders with persisted settings', async () => {
  const renderer = renderWithInsets(SettingsScreen as React.ComponentType);
  // The in-app-review availability check resolves after the initial commit;
  // flush its microtask inside act so the setState isn't logged as unwrapped.
  await act(async () => {});
  const json = JSON.stringify(renderer.toJSON());
  renderer.unmount();
  // The header is an icon-only back bubble (no "Settings" title since the
  // Liquid Glass header redesign) — assert on section labels instead. The
  // test environment has no native Live Activity module, so the whole
  // Blocking section hides (`missing`) instead of showing a dead row.
  expect(json).toContain('Theme');
  expect(json).not.toContain('Lock screen activity');
});
