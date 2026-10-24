/**
 * Expo Go (storeClient) smoke test.
 *
 * Inside Expo Go the execution environment is 'storeClient' and custom native
 * modules do not exist. Evaluating react-native-device-activity throws there:
 * its iOS module graph pulls native-only SwiftUI views (requireNativeViewManager)
 * at import time. The mock below reproduces exactly that — a regression to a
 * static import of the lib anywhere in the evaluated startup graph fails here.
 */
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants') as Record<string, unknown>;
  return {
    ...actual,
    default: { ...(actual.default as object), executionEnvironment: 'storeClient' },
    ExecutionEnvironment: actual.ExecutionEnvironment,
  };
});

jest.mock('react-native-device-activity', () => {
  throw new Error(
    'react-native-device-activity is not available in Expo Go (import-time throw)',
  );
});

describe('blocking feature under Expo Go', () => {
  it('evaluates the whole startup module graph without touching the lib', () => {
    // Startup-reachable modules: engine surface, App Group store, native
    // picker wrappers, block-notification planning (mounted in the root
    // layout, with its own guarded native require).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('../index')).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('../appGroupStore')).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('../SelectionPicker')).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('@/features/rules/components/AppPicker')).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('@/features/onboarding/blockNotifications')).not.toThrow();
  });

  it('resolves the mock engine and safe App Group no-ops', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blocking = require('../index') as typeof import('../index');
    expect(blocking.engineMode()).toBe('mock');
    expect(blocking.getBlockingEngine().authorize).toBeInstanceOf(Function);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { libBackend } = require('../appGroupStore') as typeof import('../appGroupStore');
    expect(libBackend.get<number>('veto_nothing')).toBeUndefined();
    expect(() => libBackend.set('veto_probe', 1)).not.toThrow();
    expect(libBackend.keysWithPrefix('veto_')).toEqual([]);
  });
});
