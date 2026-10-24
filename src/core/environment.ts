/**
 * Runtime execution-environment flags.
 *
 * Expo Go (`Constants.executionEnvironment === 'storeClient'`) carries only
 * the Expo SDK's native modules: Veto's custom native side — Family Controls
 * / DeviceActivity (react-native-device-activity) and MMKV — cannot exist
 * there. Every native touchpoint gates on `isExpoGo()` and degrades to the
 * mock engine / in-memory stores, so the prototype is scannable via
 * `npx expo start` while dev-client builds keep the native path untouched.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';

/** True when the JS bundle runs inside the Expo Go client. */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
