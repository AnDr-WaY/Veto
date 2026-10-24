import * as lib from 'react-native-device-activity';

import { createMemoryBackend, readMirror } from '../appGroupStore';
import { DeviceActivityEngine } from '../deviceActivityEngine';
import { graceActivityName } from '../ruleCompiler';
import type { BlockRule } from '../../../core/contracts';

jest.mock('react-native-device-activity', () => {
  const fns = {
    requestAuthorization: jest.fn().mockResolvedValue(undefined),
    pollAuthorizationStatus: jest.fn().mockResolvedValue(2),
    AuthorizationStatus: { notDetermined: 0, denied: 1, approved: 2 },
    startMonitoring: jest.fn().mockResolvedValue(undefined),
    stopMonitoring: jest.fn(),
    cleanUpAfterActivity: jest.fn(),
    configureActions: jest.fn(),
    blockSelection: jest.fn(),
    unblockSelection: jest.fn(),
    updateShieldWithId: jest.fn(),
    setFamilyActivitySelectionId: jest.fn(),
    getFamilyActivitySelectionId: jest.fn((id: string) => `token_${id}`),
    getActivities: jest.fn().mockReturnValue([]),
    isAvailable: jest.fn().mockReturnValue(true),
    userDefaultsGet: jest.fn(),
    userDefaultsSet: jest.fn(),
    userDefaultsRemove: jest.fn(),
    userDefaultsAll: jest.fn().mockReturnValue({}),
  };
  return fns;
});

const mocked = lib as unknown as {
  requestAuthorization: jest.Mock;
  pollAuthorizationStatus: jest.Mock;
  startMonitoring: jest.Mock;
  stopMonitoring: jest.Mock;
  configureActions: jest.Mock;
  blockSelection: jest.Mock;
  unblockSelection: jest.Mock;
  updateShieldWithId: jest.Mock;
  setFamilyActivitySelectionId: jest.Mock;
  getFamilyActivitySelectionId: jest.Mock;
  cleanUpAfterActivity: jest.Mock;
};

function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'r1',
    title: 'Focus',
    selectionRef: 'sel_r1',
    selectionCount: 2,
    days: 'daily',
    startMin: 9 * 60,
    endMin: 10 * 60,
    strictness: 'hard',
    shieldMessage: 'Stay focused',
    paused: false,
    createdAt: 0,
    ...overrides,
  };
}

const NOW = new Date(2026, 9, 21, 12, 0).getTime();

function newEngine() {
  return new DeviceActivityEngine(createMemoryBackend(), () => NOW);
}


beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeviceActivityEngine — authorize', () => {
  it('maps the polled status to the contract enum', async () => {
    mocked.pollAuthorizationStatus.mockResolvedValue(1);
    await expect(newEngine().authorize()).resolves.toBe('denied');
    expect(mocked.requestAuthorization).toHaveBeenCalledWith('individual');
  });
});

describe('DeviceActivityEngine — apply', () => {
  it('schedules monitoring, configures actions and writes the shield config', async () => {
    const engine = newEngine();
    await engine.apply(makeRule());

    // Regression: the picker only emits the serialized selection — apply must
    // register it under the ref or every native lookup by id fails.
    expect(mocked.setFamilyActivitySelectionId).toHaveBeenCalledWith({
      id: 'sel_r1',
      familyActivitySelection: 'sel_r1',
    });
    expect(mocked.startMonitoring).toHaveBeenCalledTimes(1);
    const [name, schedule, events] = mocked.startMonitoring.mock.calls[0];
    expect(name).toBe('veto_rule_r1');
    expect(schedule).toEqual({
      intervalStart: { hour: 9, minute: 0 },
      intervalEnd: { hour: 10, minute: 0 },
      repeats: true,
    });
    expect(events).toEqual([]);

    const configured = new Set(
      mocked.configureActions.mock.calls.map((call) => call[0].activityName),
    );
    expect(configured).toContain('veto_rule_r1');

    const forRule = (callbackName: string) =>
      mocked.configureActions.mock.calls.find(
        (call) => call[0].activityName === 'veto_rule_r1' && call[0].callbackName === callbackName,
      )?.[0];
    expect(forRule('intervalDidStart')?.actions).toEqual([
      { type: 'blockSelection', familyActivitySelectionId: 'sel_r1', shieldId: 'sel_r1' },
    ]);
    expect(forRule('intervalDidEnd')?.actions).toEqual([
      { type: 'unblockSelection', familyActivitySelectionId: 'sel_r1' },
    ]);

    // Shield config: no bypass — the Close button only (skip mechanic is
    // gone; legacy skip labels stored by older builds are overwritten).
    expect(mocked.updateShieldWithId).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: { red: 10, green: 10, blue: 10, alpha: 255 } }),
      expect.objectContaining({
        primary: expect.objectContaining({ behavior: 'close', type: 'dismiss' }),
      }),
      'sel_r1',
    );
  });

  it('blocks immediately when applied inside the window', async () => {
    const engine = newEngine();
    // NOW is 12:00 — inside 11:00..13:00.
    await engine.apply(makeRule({ startMin: 11 * 60, endMin: 13 * 60 }));
    expect(mocked.blockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'sel_r1' },
      'veto.apply.midwindow',
    );
  });

  it('applying a paused rule disarms monitoring and lifts the current block', async () => {
    const engine = newEngine();
    // NOW is 12:00 — inside 11:00..13:00, i.e. the rule is actively blocking.
    await engine.apply(makeRule({ startMin: 11 * 60, endMin: 13 * 60 }));
    jest.clearAllMocks();

    await engine.apply(makeRule({ startMin: 11 * 60, endMin: 13 * 60, paused: true }));

    expect(mocked.startMonitoring).not.toHaveBeenCalled();
    expect(mocked.stopMonitoring).toHaveBeenCalledWith(['veto_rule_r1']);
    expect(mocked.cleanUpAfterActivity).toHaveBeenCalledWith('veto_rule_r1');
    expect(mocked.unblockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'sel_r1' },
      'veto.apply.paused',
    );
    expect(mocked.blockSelection).not.toHaveBeenCalled();
  });

  it('resuming a paused rule re-arms monitoring and blocks mid-window again', async () => {
    const engine = newEngine();
    await engine.apply(makeRule({ startMin: 11 * 60, endMin: 13 * 60, paused: true }));
    jest.clearAllMocks();

    await engine.apply(makeRule({ startMin: 11 * 60, endMin: 13 * 60 }));

    expect(mocked.startMonitoring).toHaveBeenCalledTimes(1);
    expect(mocked.blockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'sel_r1' },
      'veto.apply.midwindow',
    );
    expect(mocked.unblockSelection).not.toHaveBeenCalled();
  });

  it('threshold rules configure the usage event instead of intervalDidStart blocking', async () => {
    const engine = newEngine();
    await engine.apply(makeRule({ strictness: 'threshold', thresholdMin: 20 }));

    const byKey = mocked.configureActions.mock.calls.map((call) => `${call[0].callbackName}`);
    expect(byKey).toContain('eventDidReachThreshold');

    const thresholdCall = mocked.configureActions.mock.calls.find(
      (call) => call[0].callbackName === 'eventDidReachThreshold',
    );
    expect(thresholdCall?.[0].eventName).toBe('veto_threshold_r1');
    expect(thresholdCall?.[0].actions).toEqual([
      { type: 'blockSelection', familyActivitySelectionId: 'sel_r1', shieldId: 'sel_r1' },
    ]);

    const startCall = mocked.configureActions.mock.calls.find(
      (call) => call[0].callbackName === 'intervalDidStart',
    );
    expect(startCall?.[0].actions).toEqual([]);
    expect(mocked.blockSelection).not.toHaveBeenCalled();
  });

  it('rejects rules without a stored selection', async () => {
    mocked.getFamilyActivitySelectionId.mockReturnValueOnce(undefined);
    await expect(newEngine().apply(makeRule())).rejects.toThrow(/selectionRef/);
  });
});

describe('DeviceActivityEngine — reconcile', () => {
  it('removes ghost enforcement whose rule is gone from storage, keeps the rest', async () => {
    const engine = newEngine();
    await engine.apply(makeRule());
    await engine.apply(makeRule({ id: 'r2', title: 'Gone' }));
    jest.clearAllMocks();

    // 'r2' was created on an install whose storage was wiped — only the
    // mirror still knows it.
    await engine.reconcile(['r1']);

    expect(mocked.stopMonitoring.mock.calls.some(([names]) => (names as string[]).includes('veto_rule_r2'))).toBe(true);
    expect(mocked.stopMonitoring.mock.calls.some(([names]) => (names as string[]).includes('veto_rule_r1'))).toBe(false);
    // The ghost's mirror entry is gone; the live rule stays mirrored.
    const backend = (engine as unknown as { backend: ReturnType<typeof createMemoryBackend> }).backend;
    expect(Object.keys(readMirror(backend))).toEqual(['r1']);
  });
});

describe('DeviceActivityEngine — remove', () => {
  it('stops activities, unblocks and cleans the mirror', async () => {
    const engine = newEngine();
    await engine.apply(makeRule());
    jest.clearAllMocks();

    await engine.remove('r1');
    const stopped = mocked.stopMonitoring.mock.calls[0][0] as string[];
    expect(stopped).toContain('veto_rule_r1');
    expect(stopped).toContain(graceActivityName('r1'));
    expect(mocked.unblockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'sel_r1' },
      'veto.remove',
    );
    expect(mocked.cleanUpAfterActivity).toHaveBeenCalledWith('veto_rule_r1');
  });
});

describe('DeviceActivityEngine — pause/resume', () => {
  it('pauseAll unblocks now and schedules an automatic re-block', async () => {
    const engine = newEngine();
    await engine.apply(makeRule());
    jest.clearAllMocks();

    await engine.pauseAll(30);
    expect(mocked.unblockSelection).toHaveBeenCalled();
    expect(mocked.startMonitoring).toHaveBeenCalledTimes(1);
    const [name, schedule] = mocked.startMonitoring.mock.calls[0];
    expect(name).toBe('veto_global_pause');
    expect(schedule.repeats).toBe(false);

    // intervalDidStart of the rule is suppressed until the pause ends.
    const suppressed = mocked.configureActions.mock.calls.find(
      (call) => call[0].callbackName === 'intervalDidStart' && call[0].activityName === 'veto_rule_r1',
    );
    expect(suppressed?.[0].actions[0]).toMatchObject({
      type: 'blockSelection',
      neverTriggerBefore: expect.any(Date),
    });
  });

  it('resumeAll restores blocking inside the window and clears suppression', async () => {
    const engine = newEngine();
    // Window 11:00..13:00, NOW inside.
    await engine.apply(makeRule({ startMin: 11 * 60, endMin: 13 * 60 }));
    await engine.pauseAll(30);
    jest.clearAllMocks();

    await engine.resumeAll();
    expect(mocked.stopMonitoring).toHaveBeenCalledWith(['veto_global_pause']);
    expect(mocked.blockSelection).toHaveBeenCalledWith(
      { activitySelectionId: 'sel_r1' },
      'veto.resumeAll',
    );
    const restored = mocked.configureActions.mock.calls.find(
      (call) => call[0].callbackName === 'intervalDidStart',
    );
    expect(restored?.[0].actions[0]).not.toHaveProperty('neverTriggerBefore');
  });

  it('rejects non-positive pause durations', async () => {
    await expect(newEngine().pauseAll(0)).rejects.toThrow(RangeError);
  });
});


describe('DeviceActivityEngine — rearmAll', () => {
  it('re-applies mirrored rules and skips completed one-shots', async () => {
    const engine = newEngine();
    await engine.apply(makeRule({ oneShot: true, days: [3], startMin: 9 * 60 }));
    expect(mocked.startMonitoring).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();

    // Not completed yet → re-armed again.
    await engine.rearmAll();
    expect(mocked.startMonitoring).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();

    // Extension persisted intervalDidEnd for the activity → done forever.
    (engine as unknown as { backend: { set: (k: string, v: unknown) => void } }).backend.set(
      'events_veto_rule_r1_intervalDidEnd',
      NOW + 60 * 60_000,
    );
    await engine.rearmAll();
    expect(mocked.startMonitoring).not.toHaveBeenCalled();
    jest.clearAllMocks();

    // And it stays skipped on subsequent rearm passes (marker).
    await engine.rearmAll();
    expect(mocked.startMonitoring).not.toHaveBeenCalled();
  });

});

