import {
  GLOBAL_PAUSE_ACTIVITY,
  appleWeekday,
  compileFromNowActivity,
  compileRuleActivities,
  dailyActivityName,
  graceActivityName,
  isInsideWindow,
  isVetoActivityName,
  nextOccurrence,
  ruleActivityNames,
  thresholdEventName,
  weekdayActivityName,
} from '../ruleCompiler';
import type { BlockRule } from '../../../core/contracts';

/** Local timezone fixed to a known point: Wed 2026-10-21 12:00 local. */
function wednesdayNoon(): number {
  const d = new Date(2026, 9, 21, 12, 0, 0, 0);
  return d.getTime();
}

function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'r1',
    title: 'Deep work',
    selectionRef: 'sel_r1',
    selectionCount: 3,
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

describe('ruleCompiler — names', () => {
  it('builds stable activity names', () => {
    expect(dailyActivityName('r1')).toBe('veto_rule_r1');
    expect(weekdayActivityName('r1', 3)).toBe('veto_rule_r1_d3');
    expect(graceActivityName('r1')).toBe('veto_grace_r1');
    expect(thresholdEventName('r1')).toBe('veto_threshold_r1');
    expect(GLOBAL_PAUSE_ACTIVITY).toBe('veto_global_pause');
  });

  it('maps contracts weekdays (0=Sun) to Apple weekdays (1=Sun)', () => {
    expect(appleWeekday(0)).toBe(1);
    expect(appleWeekday(6)).toBe(7);
  });

  it('recognizes veto activity names for cleanup', () => {
    expect(isVetoActivityName('veto_rule_r1_d2')).toBe(true);
    expect(isVetoActivityName('veto_grace_r1')).toBe(true);
    expect(isVetoActivityName('veto_global_pause')).toBe(true);
    expect(isVetoActivityName('something_else')).toBe(false);
  });

  it('expands weekday rules to one activity per unique day, sorted', () => {
    const names = ruleActivityNames(makeRule({ days: [3, 1, 3, 5] }));
    expect(names).toEqual(['veto_rule_r1_d1', 'veto_rule_r1_d3', 'veto_rule_r1_d5']);
  });
});

describe('ruleCompiler — schedules', () => {
  it('compiles a daily recurring window without weekday components', () => {
    const [activity] = compileRuleActivities(makeRule(), 'token', wednesdayNoon());
    expect(activity.name).toBe('veto_rule_r1');
    expect(activity.schedule).toEqual({
      intervalStart: { hour: 9, minute: 0 },
      intervalEnd: { hour: 10, minute: 0 },
      repeats: true,
    });
    expect(activity.events).toEqual([]);
  });

  it('compiles weekday windows with Apple weekday components and repeats', () => {
    const activities = compileRuleActivities(makeRule({ days: [0, 6] }), 'token', wednesdayNoon());
    expect(activities.map((a) => a.name)).toEqual(['veto_rule_r1_d0', 'veto_rule_r1_d6']);
    expect(activities[0].schedule.intervalStart).toEqual({ hour: 9, minute: 0, weekday: 1 });
    expect(activities[1].schedule.intervalEnd).toEqual({ hour: 10, minute: 0, weekday: 7 });
    expect(activities.every((a) => a.schedule.repeats)).toBe(true);
  });

  it('compiles a one-shot rule to the next occurrence with absolute components', () => {
    const rule = makeRule({ oneShot: true, days: [1] }); // Mondays 09:00-10:00
    const [activity] = compileRuleActivities(rule, 'token', wednesdayNoon());
    expect(activity.schedule.repeats).toBe(false);
    expect(activity.schedule.intervalStart).toMatchObject({ hour: 9, minute: 0 });
    // 2026-10-21 is Wednesday → next Monday is 2026-10-26.
    expect(activity.schedule.intervalStart).toMatchObject({ year: 2026, month: 10, day: 26 });
    expect(activity.schedule.intervalEnd).toMatchObject({ year: 2026, month: 10, day: 26, hour: 10 });
  });

  it('splits an overnight daily window at midnight', () => {
    const activities = compileRuleActivities(
      makeRule({ startMin: 22 * 60, endMin: 2 * 60 }),
      'token',
      wednesdayNoon(),
    );
    expect(activities.map((a) => a.name)).toEqual(['veto_rule_r1_n', 'veto_rule_r1_m']);
    expect(activities[0].schedule).toEqual({
      intervalStart: { hour: 22, minute: 0 },
      intervalEnd: { hour: 0, minute: 0 },
      repeats: true,
    });
    expect(activities[1].schedule).toEqual({
      intervalStart: { hour: 0, minute: 0 },
      intervalEnd: { hour: 2, minute: 0 },
      repeats: true,
    });
  });

  it('splits overnight weekday windows onto the following morning', () => {
    const activities = compileRuleActivities(
      makeRule({ days: [1], startMin: 23 * 60, endMin: 60 }),
      'token',
      wednesdayNoon(),
    );
    expect(activities.map((a) => a.name)).toEqual(['veto_rule_r1_n1', 'veto_rule_r1_m2']);
    // Monday evening (Apple weekday 2), Tuesday morning (Apple weekday 3).
    expect(activities[0].schedule.intervalStart).toEqual({ hour: 23, minute: 0, weekday: 2 });
    expect(activities[1].schedule.intervalStart).toEqual({ hour: 0, minute: 0, weekday: 3 });
    expect(activities[1].schedule.intervalEnd).toEqual({ hour: 1, minute: 0, weekday: 3 });
  });

  it('compiles a one-shot overnight window across midnight', () => {
    const rule = makeRule({ oneShot: true, startMin: 23 * 60, endMin: 60 });
    const [activity] = compileRuleActivities(rule, 'token', wednesdayNoon());
    expect(activity.schedule.repeats).toBe(false);
    expect(activity.schedule.intervalStart).toMatchObject({ hour: 23, minute: 0 });
    expect(activity.schedule.intervalEnd).toMatchObject({ hour: 1, minute: 0 });
    // Ends on the next calendar day.
    expect(activity.schedule.intervalEnd).toMatchObject({ day: 22, month: 10 });
  });

  it('compiles endMin 1440 (24:00) as 00:00', () => {
    const [activity] = compileRuleActivities(makeRule({ startMin: 23 * 60, endMin: 24 * 60 }), 'token');
    expect(activity.schedule.intervalStart).toEqual({ hour: 23, minute: 0 });
    expect(activity.schedule.intervalEnd).toEqual({ hour: 0, minute: 0 });
  });

  it('compiles a threshold event only for threshold rules', () => {
    const threshold = makeRule({ strictness: 'threshold', thresholdMin: 20 });
    const [activity] = compileRuleActivities(threshold, 'token-abc');
    expect(activity.events).toEqual([
      {
        eventName: 'veto_threshold_r1',
        familyActivitySelection: 'token-abc',
        threshold: { hour: 0, minute: 20 },
        includesPastActivity: false,
      },
    ]);

    const soft = compileRuleActivities(makeRule({ strictness: 'hard' }), 'token-abc');
    expect(soft[0].events).toEqual([]);
  });

  it('rejects invalid windows but accepts overnight ones', () => {
    expect(() => compileRuleActivities(makeRule({ startMin: 600, endMin: 600 }), 't')).toThrow(RangeError);
    // end < start crosses midnight and compiles to two split activities.
    expect(compileRuleActivities(makeRule({ startMin: 700, endMin: 600 }), 't')).toHaveLength(2);
    expect(() =>
      compileRuleActivities(makeRule({ strictness: 'threshold', thresholdMin: 0 }), 't'),
    ).toThrow(RangeError);
  });
});

describe('ruleCompiler — helpers', () => {
  it('finds the next occurrence across week boundaries', () => {
    const rule = makeRule({ days: [1], startMin: 22 * 60 }); // Monday 22:00
    const next = nextOccurrence(rule, wednesdayNoon());
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(22);
    expect(next.getTime()).toBeGreaterThan(wednesdayNoon());
  });

  it('finds today occurrence when the window has not started yet', () => {
    const rule = makeRule({ days: [3], startMin: 18 * 60 }); // Wednesday 18:00
    const next = nextOccurrence(rule, wednesdayNoon());
    expect(next.getDate()).toBe(21);
    expect(next.getHours()).toBe(18);
  });

  it('detects mid-window apply', () => {
    const rule = makeRule({ days: [3], startMin: 9 * 60, endMin: 10 * 60 }); // Wednesdays
    const inside = new Date(2026, 9, 21, 9, 30).getTime(); // Wednesday
    const before = new Date(2026, 9, 21, 8, 59).getTime();
    const wrongDay = new Date(2026, 9, 22, 9, 30).getTime(); // Thursday
    expect(isInsideWindow(rule, inside)).toBe(true);
    expect(isInsideWindow(rule, before)).toBe(false);
    expect(isInsideWindow(rule, wrongDay)).toBe(false);
  });

  it('detects mid-window apply for overnight windows', () => {
    // Mondays 23:00 -> 01:00: the morning tail belongs to Monday's window.
    const rule = makeRule({ days: [1], startMin: 23 * 60, endMin: 60 });
    const mondayLate = new Date(2026, 9, 19, 23, 30).getTime();
    const tuesdayEarly = new Date(2026, 9, 20, 0, 30).getTime();
    const tuesdayLate = new Date(2026, 9, 20, 23, 30).getTime();
    const wednesdayEarly = new Date(2026, 9, 21, 0, 30).getTime();
    expect(isInsideWindow(rule, mondayLate)).toBe(true);
    expect(isInsideWindow(rule, tuesdayEarly)).toBe(true);
    // Tuesday evening starts a Tuesday window, which does not exist.
    expect(isInsideWindow(rule, tuesdayLate)).toBe(false);
    expect(isInsideWindow(rule, wednesdayEarly)).toBe(false);
  });

  it('compiles from-now one-shots with absolute components (grace/pause)', () => {
    const now = new Date(2026, 9, 21, 23, 50, 0).getTime();
    const grace = compileFromNowActivity(graceActivityName('r1'), 15, now);
    expect(grace.name).toBe('veto_grace_r1');
    expect(grace.schedule.repeats).toBe(false);
    expect(grace.schedule.intervalStart).toMatchObject({ day: 21, hour: 23, minute: 50 });
    // Crosses midnight: end is next day 00:05.
    expect(grace.schedule.intervalEnd).toMatchObject({ day: 22, hour: 0, minute: 5 });
    expect(grace.events).toEqual([]);
  });

  it('rejects non-positive durations for from-now activities', () => {
    expect(() => compileFromNowActivity('x', 0)).toThrow(RangeError);
    expect(() => compileFromNowActivity('x', 5.5)).toThrow(RangeError);
  });
});
