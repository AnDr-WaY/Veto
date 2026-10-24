import { engineMode, getBlockingEngine } from '../index';
import { MockBlockingEngine } from '../mockEngine';
import { DeviceActivityEngine } from '../deviceActivityEngine';

describe('engine factory', () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_ENGINE;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.EXPO_PUBLIC_ENGINE;
    } else {
      process.env.EXPO_PUBLIC_ENGINE = ORIGINAL;
    }
  });

  it('EXPO_PUBLIC_ENGINE=mock forces the mock engine', () => {
    process.env.EXPO_PUBLIC_ENGINE = 'mock';
    expect(engineMode()).toBe('mock');
    expect(getBlockingEngine()).toBeInstanceOf(MockBlockingEngine);
  });

  it('falls back to mock when the native module is unavailable (jest)', () => {
    delete process.env.EXPO_PUBLIC_ENGINE;
    // In jest the native module is absent → isAvailable() is false.
    expect(engineMode()).toBe('mock');
  });

  it('getBlockingEngine is a stable singleton', () => {
    process.env.EXPO_PUBLIC_ENGINE = 'mock';
    expect(getBlockingEngine()).toBe(getBlockingEngine());
  });

  it('engines expose the base contract', async () => {
    process.env.EXPO_PUBLIC_ENGINE = 'mock';
    const engine = getBlockingEngine();
    expect(typeof engine.authorize).toBe('function');
    expect(typeof (DeviceActivityEngine.prototype.rearmAll)).toBe('function');
  });
});
