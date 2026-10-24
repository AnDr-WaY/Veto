/**
 * Key-value storage foundation.
 *
 * Production: the shared App-Group UserDefaults through the
 * react-native-device-activity native module — the exact store the blocking
 * engine (mirror, selection registry, shield configs) has used since Ч3 and
 * the ONLY persistence proven to work in every release build on device.
 *
 * Removed on purpose after the build-18/19 crash investigation:
 * - MMKV/Nitro silently failed to register its TurboModule in release
 *   builds — all data lived in memory and vanished on every restart;
 * - expo-sqlite writes at module scope were present in both crashing builds
 *   and absent from build 17 (which never crashed), so they stay out of the
 *   launch path too. Neither library is even attempted anymore.
 *
 * The native module loads through a lexical require guarded by try/catch;
 * failures fall back to in-memory (jest, Expo Go) and are logged AND shown
 * in Settings → Developer → Storage — a non-persisting install is never
 * silent again.
 */

export interface StringKV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  clearAll(): void;
}

/** In-memory fallback — jest, previews, unsupported platforms. */
export class MemoryKV implements StringKV {
  private map = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  contains(key: string): boolean {
    return this.map.has(key);
  }

  getAllKeys(): string[] {
    return [...this.map.keys()];
  }

  clearAll(): void {
    this.map.clear();
  }
}

/**
 * Minimal surface of the react-native-device-activity module the KV uses —
 * the same App-Group UserDefaults API the blocking engine already rides on.
 * NOTE the positional signatures: the lib's wrappers take (key, value), not
 * an options object.
 */
interface DeviceActivityStoreModule {
  userDefaultsGet: (forKey: string) => unknown;
  userDefaultsSet: (key: string, value: unknown) => void;
  userDefaultsRemove: (forKey: string) => void;
  userDefaultsAll: () => Record<string, unknown> | undefined;
}

let nativeModule: DeviceActivityStoreModule | null | undefined;

/**
 * Guarded require (same idiom as the blocking engine): under jest the JS
 * side resolves but the native calls are missing — the probe in createKV
 * handles that. A thrown require falls to memory.
 */
function deviceActivityStore(): DeviceActivityStoreModule | null {
  if (nativeModule === undefined) {
    try {
      // Literal specifier so Metro keeps the module in the bundle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nativeModule = require('react-native-device-activity') as DeviceActivityStoreModule;
    } catch (error) {
      nativeModule = null;
      noteStorageError('appgroup', error);
    }
  }
  return nativeModule;
}

/**
 * App-Group UserDefaults-backed KV. Values are plain strings, namespaced
 * (`veto_kv_`) to stay clear of the engine's own keys in the same suite.
 */
class AppGroupKV implements StringKV {
  private static readonly PREFIX = 'veto_kv_';

  private full(key: string): string {
    return AppGroupKV.PREFIX + key;
  }

  getString(key: string): string | undefined {
    const value = deviceActivityStore()?.userDefaultsGet(this.full(key));
    return typeof value === 'string' ? value : undefined;
  }

  set(key: string, value: string): void {
    deviceActivityStore()?.userDefaultsSet(this.full(key), value);
  }

  delete(key: string): void {
    deviceActivityStore()?.userDefaultsRemove(this.full(key));
  }

  contains(key: string): boolean {
    return this.getString(key) !== undefined;
  }

  getAllKeys(): string[] {
    const all = deviceActivityStore()?.userDefaultsAll() ?? {};
    return Object.keys(all)
      .filter((native) => native.startsWith(AppGroupKV.PREFIX))
      .map((native) => native.slice(AppGroupKV.PREFIX.length));
  }

  clearAll(): void {
    for (const key of this.getAllKeys()) {
      this.delete(key);
    }
  }
}

/** Last storage failure (short) — surfaced in Settings → Developer → Storage. */
export let storageError: string | null = null;

function noteStorageError(driver: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  storageError = `${driver}: ${message}`.slice(0, 160);
  console.error(`[storage] ${driver} unavailable`, error);
}

export const MMKV_INSTANCE_ID = 'veto-storage';

/**
 * Which backend actually backs `kv` — the App Group on device, or the
 * in-memory fallback. Surfaced in Settings (Developer → Storage) so a
 * non-persisting install is visible in the UI, not just in logs.
 */
export let storageKind: 'appgroup' | 'memory' = 'memory';

/**
 * Launch-time availability check of the driver (READ-ONLY — a probe write
 * would put a native call on the launch path that build 17 never made).
 */
export let storageSelfTest: 'unknown' | 'ok' | 'failed' = 'unknown';

export function createKV(): StringKV {
  const mod = deviceActivityStore();
  // Roundtrip probe: under jest-expo the module resolves but its calls are
  // no-op mocks (userDefaultsAll even returns an object) — only a real
  // write+read proves the App Group. The write itself is build-17-proven on
  // the launch path (persistShieldConfig inside rearmAll did exactly this).
  const probe = (() => {
    try {
      const marker = `__veto_probe_${Date.now()}`;
      mod?.userDefaultsSet(marker, marker);
      const echoed = mod?.userDefaultsGet(marker);
      mod?.userDefaultsRemove(marker);
      return echoed === marker;
    } catch (error) {
      noteStorageError('appgroup-probe', error);
      return false;
    }
  })();

  storageKind = probe ? 'appgroup' : 'memory';
  storageSelfTest = probe ? 'ok' : 'failed';
  return probe ? new AppGroupKV() : new MemoryKV();
}

/** Shared app-wide instance. */
export const kv: StringKV = createKV();
