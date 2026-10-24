import Constants, { ExecutionEnvironment } from 'expo-constants';

import { isExpoGo } from '../environment';

describe('isExpoGo', () => {
  it('is true exactly for the Expo Go store client execution environment', () => {
    // In jest/dev-client the environment is never 'storeClient'; the flag is
    // a direct read of Constants so this pins the exact contract.
    expect(isExpoGo()).toBe(
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    );
  });
});
