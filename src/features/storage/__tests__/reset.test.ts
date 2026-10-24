import { DEFAULT_VETO_SETTINGS, kv, resetAllData, STORAGE_KEYS } from '../index';
import { eventLog } from '../eventLog';
import { useRulesStore } from '../../../store/rulesStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useStatsStore } from '../../../store/statsStore';
import type { BlockRule } from '../../../core/contracts';

/**
 * resetAllData ("Reset all data" in Settings → Developer): every KV key is
 * removed, the event log is cleared and the live stores re-render empty.
 * Runs on the shared singletons — under jest both are the memory fallbacks.
 */

/** Valid base rule; tests override fields. */
function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule-1',
    title: 'Deep work',
    selectionRef: 'sel-1',
    selectionCount: 3,
    days: 'daily',
    startMin: 540,
    endMin: 1020,
    strictness: 'hard',
    shieldMessage: 'Focus time',
    paused: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('resetAllData', () => {
  beforeEach(() => {
    kv.clearAll();
    eventLog.clear();
    useSettingsStore.setState({ settings: { ...DEFAULT_VETO_SETTINGS, theme: 'dark' } });
    useRulesStore.setState({ rules: [], loading: false, error: null });
    useStatsStore.setState({ events: [], loading: false, error: null });
  });

  it('removes every app key, clears the event log and empties the stores', async () => {
    // Seed every artifact on the shared singletons.
    const rule = makeRule();
    kv.set(STORAGE_KEYS.rules, JSON.stringify({ [rule.id]: rule }));
    kv.set(STORAGE_KEYS.settings, JSON.stringify({ theme: 'dark' }));
    kv.set(STORAGE_KEYS.onboarding, JSON.stringify({ done: true }));
    await eventLog.append({ id: 'e1', type: 'rule_applied', ruleId: rule.id, at: Date.now() });
    useRulesStore.setState({ rules: [rule], loading: false, error: null });

    await resetAllData();

    expect(kv.getString(STORAGE_KEYS.rules)).toBeUndefined();
    expect(kv.getString(STORAGE_KEYS.settings)).toBeUndefined();
    // The onboarding flag is a legacy artifact now — the wipe still removes
    // the key, and nothing re-creates it afterwards.
    expect(kv.getString(STORAGE_KEYS.onboarding)).toBeUndefined();
    expect(kv.getAllKeys()).toEqual([]);

    await expect(eventLog.all()).resolves.toEqual([]);

    expect(useRulesStore.getState().rules).toEqual([]);
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_VETO_SETTINGS);
    expect(useStatsStore.getState().events).toEqual([]);
  });

  it('is best-effort: a failing event log wipe never throws', async () => {
    kv.set(STORAGE_KEYS.rules, '{}');
    const spy = jest.spyOn(eventLog, 'clear').mockImplementation(() => {
      throw new Error('sqlite busy');
    });

    await expect(resetAllData()).resolves.toBeUndefined();
    expect(kv.getString(STORAGE_KEYS.rules)).toBeUndefined();

    spy.mockRestore();
  });
});
