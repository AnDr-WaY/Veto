/**
 * Unit tests for the lock-screen activity seam's support tri-state.
 *
 * The seam captures the native module once at module load, so every case
 * resets the module registry and re-requires `../api` against its own fake
 * native module (the mocks survive `jest.resetModules`).
 */

// "mock"-prefixed so the hoisted jest.mock factories may close over them.
const mockExpoGo = { value: false };
const mockNativeModule: {
  value: Record<string, unknown> | null;
  throwOnRequire: boolean;
} = { value: null, throwOnRequire: false };

jest.mock('expo-modules-core', () => ({
  // Keep the rest of the real module: `expo`'s runtime chain imports
  // `requireNativeModule` from it while booting.
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: () => {
    if (mockNativeModule.throwOnRequire) {
      throw new Error('native module exploded');
    }
    return mockNativeModule.value;
  },
}));

jest.mock('../../../core/environment', () => ({
  isExpoGo: () => mockExpoGo.value,
}));

/** Install a fake native module (defaults: Live Activities enabled). */
function useNativeModule(overrides: { isAvailable?: () => boolean } = {}): void {
  mockNativeModule.value = {
    start: async () => true,
    stop: async () => true,
    isActive: () => false,
    isAvailable: () => true,
    ...overrides,
  };
}

function freshSeam(): typeof import('../api') {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../api') as typeof import('../api');
}

beforeEach(() => {
  mockExpoGo.value = false;
  mockNativeModule.value = null;
  mockNativeModule.throwOnRequire = false;
});

describe('liveActivitySupport', () => {
  it('reports missing without a native module (Expo Go / not linked)', () => {
    expect(freshSeam().liveActivitySupport()).toBe('missing');
  });

  it('reports missing when requiring the native module throws', () => {
    mockNativeModule.throwOnRequire = true;
    expect(freshSeam().liveActivitySupport()).toBe('missing');
  });

  it('reports missing under Expo Go even when a module would answer', () => {
    mockExpoGo.value = true;
    useNativeModule();
    expect(freshSeam().liveActivitySupport()).toBe('missing');
  });

  it('reports ready when Live Activities are enabled', () => {
    useNativeModule({ isAvailable: () => true });
    expect(freshSeam().liveActivitySupport()).toBe('ready');
  });

  it('reports disabled when Live Activities are switched off', () => {
    useNativeModule({ isAvailable: () => false });
    expect(freshSeam().liveActivitySupport()).toBe('disabled');
  });

  it('reports disabled when the availability probe throws', () => {
    // Module present but misbehaving — guidance, not a vanished row.
    useNativeModule({
      isAvailable: () => {
        throw new Error('probe failed');
      },
    });
    expect(freshSeam().liveActivitySupport()).toBe('disabled');
  });
});

describe('seam no-ops without a native module', () => {
  it('start / stop / isActive report false instead of throwing', async () => {
    const seam = freshSeam();
    await expect(seam.startBlockingActivity({ title: 'x', endsAt: 0 })).resolves.toBe(false);
    await expect(seam.stopBlockingActivity()).resolves.toBe(false);
    expect(seam.isBlockingActivityActive()).toBe(false);
  });
});
