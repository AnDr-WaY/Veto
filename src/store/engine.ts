/**
 * Engine accessor for the store layer.
 *
 * Delegates to `@/features/blocking`: `EXPO_PUBLIC_ENGINE=mock` forces the
 * demo engine, otherwise the native DeviceActivity engine is used when
 * available (non-iOS and jest fall back to the mock).
 *
 * Stores only need the BlockingEngine contract (authorize/apply/remove/
 * pauseAll/resumeAll); the grace capability comes along on the same singleton.
 */
export { getBlockingEngine as getEngine } from '../features/blocking';
