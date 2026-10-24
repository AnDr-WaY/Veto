import type { NewBlockRule } from '../../core/contracts';
import {
  DEFAULT_VETO_SETTINGS,
  MmkvRulesRepository,
  MmkvSettingsRepository,
} from '../../features/storage';
import { kv } from '../../features/storage/kv';
import { eventLog } from '../../features/storage/eventLog';
import { addDays, startOfDay } from '../../lib/date';
import { periodStart, useStatsStore } from '../statsStore';
import { useRulesStore } from '../rulesStore';
import { useSettingsStore } from '../settingsStore';

/** Fresh storage + store state before every test. */
beforeEach(() => {
  kv.clearAll();
  eventLog.clear();
  useSettingsStore.setState({
    settings: { ...DEFAULT_VETO_SETTINGS },
    loading: false,
  });
  useRulesStore.setState({ rules: [], loading: false, error: null });
  useStatsStore.setState({ events: [], loading: false, error: null, period: 'today' });
});

function makeRuleInput(overrides: Partial<NewBlockRule> = {}): NewBlockRule {
  return {
    title: 'Deep work',
    selectionRef: 'sel-1',
    selectionCount: 2,
    days: 'daily',
    startMin: 540,
    endMin: 1020,
    strictness: 'hard',
    shieldMessage: 'Focus',
    ...overrides,
  };
}

describe('settingsStore', () => {
  it('hydrates with defaults and updates persist to storage', async () => {
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_VETO_SETTINGS);

    await useSettingsStore.getState().update({ hapticsEnabled: false });

    expect(useSettingsStore.getState().settings.hapticsEnabled).toBe(false);
    // A fresh repository over the same storage sees the change.
    expect(new MmkvSettingsRepository().readSync().hapticsEnabled).toBe(false);
  });

  it('pause persists globalPausedUntil, calls the engine and logs an event', async () => {
    const before = Date.now();
    await useSettingsStore.getState().pause(30);

    const { settings } = useSettingsStore.getState();
    expect(settings.globalPausedUntil).not.toBeNull();
    expect(settings.globalPausedUntil! - before).toBeGreaterThanOrEqual(29 * 60_000);
    expect(settings.globalPausedUntil! - before).toBeLessThanOrEqual(31 * 60_000);

    const events = await eventLog.all();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('paused');
    expect(events[0].meta).toEqual({ minutes: 30 });
  });

  it('resume lifts the pause and logs resumed', async () => {
    await useSettingsStore.getState().pause(30);
    await useSettingsStore.getState().resume();

    expect(useSettingsStore.getState().settings.globalPausedUntil).toBeNull();
    const events = await eventLog.all();
    expect(events.map((event) => event.type)).toEqual(['paused', 'resumed']);
  });

  it('clamps durations below one minute', async () => {
    await useSettingsStore.getState().pause(0);
    const events = await eventLog.all();
    expect(events[0].meta).toEqual({ minutes: 1 });
  });

  it('tickPause auto-resumes an expired pause with an auto event', async () => {
    await useSettingsStore.getState().update({ globalPausedUntil: Date.now() - 1_000 });
    expect(useSettingsStore.getState().settings.globalPausedUntil).not.toBeNull();

    useSettingsStore.getState().tickPause();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(useSettingsStore.getState().settings.globalPausedUntil).toBeNull();
    const events = await eventLog.all();
    expect(events.map((event) => event.type)).toEqual(['resumed']);
    expect(events[0].meta).toEqual({ auto: true });
  });

  it('tickPause keeps an active pause untouched', async () => {
    await useSettingsStore.getState().update({ globalPausedUntil: Date.now() + 60_000 });
    useSettingsStore.getState().tickPause();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(useSettingsStore.getState().settings.globalPausedUntil).not.toBeNull();
  });
});

describe('rulesStore', () => {
  it('create persists the rule and logs rule_applied', async () => {
    const rule = await useRulesStore.getState().create(makeRuleInput());

    expect(rule.id).toMatch(/^rule_/);
    expect(rule.paused).toBe(false);
    expect(useRulesStore.getState().rules).toEqual([rule]);

    const stored = await eventLog.all();
    expect(stored).toHaveLength(1);
    expect(stored[0].type).toBe('rule_applied');
    expect(stored[0].ruleId).toBe(rule.id);

    // Persisted on disk.
    await expect(new MmkvRulesRepository().get(rule.id)).resolves.toMatchObject({
      title: 'Deep work',
    });
  });

  it('create rejects invalid rules without persisting or logging', async () => {
    await expect(
      useRulesStore.getState().create(makeRuleInput({ startMin: 600, endMin: 600 })),
    ).rejects.toThrow(/window/);
    expect(useRulesStore.getState().rules).toEqual([]);
    expect(await eventLog.all()).toEqual([]);
  });

  it('update patches, re-arms and persists', async () => {
    const rule = await useRulesStore.getState().create(makeRuleInput());
    await useRulesStore.getState().update(rule.id, { title: 'Gym', endMin: 660 });

    const updated = useRulesStore.getState().rules[0];
    expect(updated.title).toBe('Gym');
    expect(updated.endMin).toBe(660);

    const stored = await eventLog.all();
    expect(stored).toHaveLength(2);
    expect(stored[1].type).toBe('rule_applied');
    expect(stored[1].meta).toEqual({ title: 'Gym', rearmed: true });
  });

  it('update on an unknown rule throws', async () => {
    await expect(useRulesStore.getState().update('nope', { title: 'X' })).rejects.toThrow(
      /unknown rule/,
    );
  });

  it('remove deletes from store, storage and logs rule_removed', async () => {
    const rule = await useRulesStore.getState().create(makeRuleInput());
    await useRulesStore.getState().remove(rule.id);

    expect(useRulesStore.getState().rules).toEqual([]);
    const types = (await eventLog.all()).map((event) => event.type);
    expect(types).toEqual(['rule_applied', 'rule_removed']);
  });

  it('refresh loads rules persisted by earlier sessions', async () => {
    const rule = await useRulesStore.getState().create(makeRuleInput());
    useRulesStore.setState({ rules: [] }); // simulate a fresh app start

    await useRulesStore.getState().refresh();
    expect(useRulesStore.getState().rules).toEqual([rule]);
    expect(useRulesStore.getState().loading).toBe(false);
    expect(useRulesStore.getState().error).toBeNull();
  });
});

describe('statsStore', () => {
  it('periodStart derives local-day boundaries', () => {
    const now = new Date(2026, 9, 20, 15, 0, 0, 0).getTime();
    expect(periodStart('today', now)).toBe(startOfDay(now));
    expect(periodStart('last7', now)).toBe(startOfDay(addDays(now, -6)));
    expect(periodStart('last30', now)).toBe(startOfDay(addDays(now, -29)));
  });

  it('refresh pulls the rolling event window from the log', async () => {
    const now = Date.now();
    await eventLog.append({
      id: 'old',
      type: 'rule_applied',
      ruleId: 'r',
      at: startOfDay(addDays(now, -80)),
    });
    await eventLog.append({
      id: 'recent',
      type: 'bypass',
      ruleId: 'r',
      at: now - 60_000,
    });

    await useStatsStore.getState().refresh();
    const events = useStatsStore.getState().events;
    expect(events.map((event) => event.id)).toEqual(['old', 'recent']);
  });

  it('setPeriod switches the period and refreshes', async () => {
    await eventLog.append({
      id: 'e1',
      type: 'shield_shown',
      ruleId: 'r',
      at: Date.now(),
    });
    await useStatsStore.getState().setPeriod('last7');
    expect(useStatsStore.getState().period).toBe('last7');
    expect(useStatsStore.getState().events).toHaveLength(1);
  });
});
