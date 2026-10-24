import React, { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderElement } from '../../../ui/__tests__/testUtils';
import { DEFAULT_VETO_SETTINGS } from '../../storage';
import { kv } from '../../storage/kv';
import { eventLog } from '../../storage/eventLog';
import { useSettingsStore } from '../../../store/settingsStore';

/**
 * Render tests for the Settings lock-screen activity surface across the
 * seam's support states: `missing` hides the whole Blocking section,
 * `disabled` keeps the row and swaps the status word for guidance, `ready`
 * shows the persisted feature switch plus the mode picker (only while the
 * feature is on). The feature seam is mocked at its public boundary so no
 * native module graph is involved.
 */

// "mock"-prefixed so the hoisted jest.mock factory may close over it.
const mockFeature = {
  support: 'ready' as 'missing' | 'disabled' | 'ready',
  active: false,
};

jest.mock('@/features/liveActivity', () => ({
  ...jest.requireActual('@/features/liveActivity'),
  liveActivitySupport: () => mockFeature.support,
  isBlockingActivityActive: () => mockFeature.active,
}));

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  return {
    router: { back: () => {} },
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [callback]);
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SettingsScreen = require('../../../../app/settings').default as React.ComponentType;

beforeEach(() => {
  mockFeature.support = 'ready';
  mockFeature.active = false;
  kv.clearAll();
  eventLog.clear();
  useSettingsStore.setState({ settings: { ...DEFAULT_VETO_SETTINGS }, loading: false });
});

// The screen reads useSafeAreaInsets, which throws without a provider.
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

async function renderSettings(): Promise<string> {
  const renderer = renderElement(
    <SafeAreaProvider initialSafeAreaInsets={INSETS}>
      {React.createElement(SettingsScreen)}
    </SafeAreaProvider>,
  );
  // The in-app-review availability check resolves after the initial commit;
  // flush its microtask inside act so the setState isn't logged as unwrapped.
  await act(async () => {});
  const json = JSON.stringify(renderer.toJSON());
  // Unmount inside act: the review promise can land a pending update that
  // would otherwise flush during the unmount itself.
  act(() => {
    renderer.unmount();
  });
  return json;
}

it('hides the whole Blocking section when the native module is missing', async () => {
  mockFeature.support = 'missing';
  const json = await renderSettings();
  expect(json).toContain('Theme');
  expect(json).not.toContain('Lock screen activity');
  expect(json).not.toContain('Blocking');
});

it('keeps the row with guidance when Live Activities are switched off', async () => {
  mockFeature.support = 'disabled';
  const json = await renderSettings();
  expect(json).toContain('Lock screen activity');
  expect(json).toContain('Turn on in Settings');
  expect(json).not.toContain('Off');
});

it('shows Off without the mode picker while the feature is disabled', async () => {
  const json = await renderSettings();
  expect(json).toContain('Lock screen activity');
  expect(json).toContain('Off');
  expect(json).not.toContain('Turn on in Settings');
  expect(json).not.toContain('Current block');
});

it('shows On with the mode picker while the feature is enabled', async () => {
  useSettingsStore.setState({
    settings: { ...DEFAULT_VETO_SETTINGS, liveActivityEnabled: true },
  });
  const json = await renderSettings();
  expect(json).toContain('On');
  expect(json).toContain('Countdown shows');
  expect(json).toContain('Day');
  expect(json).toContain('Current block');
  expect(json).toContain('Both');
});
