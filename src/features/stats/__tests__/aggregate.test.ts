import type { BlockRule, EventRecord } from '../../../core/contracts';
import {
  aggregateStats,
  computeStreak,
  mergeIntervals,
  pauseIntervalsFromEvents,
  ruleWindowsInRange,
  subtractIntervals,
  sumIntervals,
  type Interval,
} from '../aggregate';

/**
 * Fixed local-time scenario: Oct 18 (Sun) .. Oct 20 (Tue) 2026.
 * Oct 19 is a Monday, Oct 20 a Tuesday.
 */
const OCT_18 = new Date(2026, 9, 18, 0, 0, 0, 0).getTime();
const OCT_19 = new Date(2026, 9, 19, 0, 0, 0, 0).getTime();
const OCT_20 = new Date(2026, 9, 20, 0, 0, 0, 0).getTime();
const OCT_20_NOON = OCT_20 + 12 * 60 * 60 * 1000;
const OCT_21 = new Date(2026, 9, 21, 0, 0, 0, 0).getTime();

const HOUR = 60 * 60 * 1000;

function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule-1',
    title: 'Deep work',
    selectionRef: 'sel-1',
    selectionCount: 2,
    days: 'daily',
    startMin: 9 * 60,
    endMin: 17 * 60,
    strictness: 'hard',
    shieldMessage: 'Focus',
    paused: false,
    createdAt: OCT_18,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1',
    type: 'shield_shown',
    ruleId: 'rule-1',
    at: OCT_20 + 10 * HOUR,
    ...overrides,
  };
}

describe('interval helpers', () => {
  it('merges overlapping and touching intervals', () => {
    const merged = mergeIntervals([
      { start: 0, end: 10 },
      { start: 5, end: 15 },
      { start: 15, end: 20 },
      { start: 30, end: 40 },
    ]);
    expect(merged).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it('subtracts cut intervals', () => {
    const from: Interval[] = [{ start: 0, end: 100 }];
    expect(subtractIntervals(from, [{ start: 20, end: 30 }])).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 100 },
    ]);
    expect(subtractIntervals(from, [{ start: 0, end: 100 }])).toEqual([]);
    expect(
      subtractIntervals(
        [{ start: 0, end: 50 }],
        [
          { start: 50, end: 60 },
          { start: -10, end: 0 },
        ],
      ),
    ).toEqual([{ start: 0, end: 50 }]);
  });

  it('sums lengths', () => {
    expect(
      sumIntervals([
        { start: 0, end: 10 },
        { start: 20, end: 35 },
      ]),
    ).toBe(25);
  });
});

describe('ruleWindowsInRange', () => {
  it('clips the window at now and at the range bounds', () => {
    const rule = makeRule(); // daily 9:00-17:00
    const windows = ruleWindowsInRange(rule, OCT_20, OCT_21, OCT_20_NOON);
    expect(windows).toEqual([{ start: OCT_20 + 9 * HOUR, end: OCT_20_NOON }]);
  });

  it('respects weekdays', () => {
    const rule = makeRule({ days: [1] }); // Mondays only
    expect(ruleWindowsInRange(rule, OCT_18, OCT_21, OCT_21)).toEqual([
      { start: OCT_19 + 9 * HOUR, end: OCT_19 + 17 * HOUR },
    ]);
  });

  it('ignores paused rules and days before creation', () => {
    expect(ruleWindowsInRange(makeRule({ paused: true }), OCT_18, OCT_21, OCT_21)).toEqual([]);
    const lateRule = makeRule({ createdAt: OCT_20 });
    // toMs = Oct 21 00:00 — the Oct 21 window (09:00) has not started yet.
    expect(ruleWindowsInRange(lateRule, OCT_18, OCT_21, OCT_21)).toEqual([
      { start: OCT_20 + 9 * HOUR, end: OCT_20 + 17 * HOUR },
    ]);
  });
});

describe('pauseIntervalsFromEvents', () => {
  it('pairs paused/resumed and caps the trailing open pause', () => {
    const events = [
      makeEvent({ id: '1', type: 'paused', ruleId: null, at: OCT_20 + 10 * HOUR }),
      makeEvent({ id: '2', type: 'resumed', ruleId: null, at: OCT_20 + 11 * HOUR }),
      makeEvent({ id: '3', type: 'paused', ruleId: null, at: OCT_20 + 12 * HOUR }),
    ];
    const intervals = pauseIntervalsFromEvents(events, OCT_20 + 14 * HOUR, OCT_20 + 13 * HOUR);
    expect(intervals).toEqual([
      { start: OCT_20 + 10 * HOUR, end: OCT_20 + 11 * HOUR },
      { start: OCT_20 + 12 * HOUR, end: OCT_20 + 13 * HOUR },
    ]);
  });

  it('uses toMs for an open pause without pausedUntil', () => {
    const events = [makeEvent({ id: '1', type: 'paused', ruleId: null, at: OCT_20 + 9 * HOUR })];
    expect(pauseIntervalsFromEvents(events, OCT_20 + 10 * HOUR, null)).toEqual([
      { start: OCT_20 + 9 * HOUR, end: OCT_20 + 10 * HOUR },
    ]);
  });
});

describe('aggregateStats', () => {
  it('computes protected minutes, attempts, grace and remaining for today', () => {
    const summary = aggregateStats({
      events: [
        makeEvent({ id: '1', type: 'shield_shown', at: OCT_20 + 9 * HOUR }),
        makeEvent({ id: '2', type: 'shield_shown', at: OCT_20 + 10 * HOUR }),
        makeEvent({ id: '3', type: 'bypass', at: OCT_20 + 10 * HOUR + HOUR }),
      ],
      rules: [makeRule()],
      fromMs: OCT_20,
      toMs: OCT_20_NOON,
      nowMs: OCT_20_NOON,
      currentPausedUntil: null,
    });
    expect(summary.protectedMinutes).toBe(180); // 9:00 -> 12:00
    expect(summary.attempts).toBe(2);
  });

  it('subtracts paused intervals from protected time', () => {
    const summary = aggregateStats({
      events: [
        makeEvent({ id: '1', type: 'paused', ruleId: null, at: OCT_20 + 10 * HOUR }),
        makeEvent({ id: '2', type: 'resumed', ruleId: null, at: OCT_20 + 11 * HOUR }),
      ],
      rules: [makeRule()],
      fromMs: OCT_20,
      toMs: OCT_20_NOON,
      nowMs: OCT_20_NOON,
      currentPausedUntil: null,
    });
    // 9:00-12:00 minus 10:00-11:00 = 2 h.
    expect(summary.protectedMinutes).toBe(120);
  });

  it('never counts time before now', () => {
    const summary = aggregateStats({
      events: [],
      rules: [makeRule()],
      fromMs: OCT_20,
      toMs: OCT_21,
      nowMs: OCT_20 + 8 * HOUR, // before the 9:00 window starts
      currentPausedUntil: null,
    });
    expect(summary.protectedMinutes).toBe(0);
  });

});

describe('computeStreak', () => {
  it('counts consecutive kept days and skips an incomplete today', () => {
    // Rule exists since Oct 18; shields today (no bypass).
    // Oct 18 and 19 are kept (protected windows), today counts too.
    const streak = computeStreak(
      [makeRule()],
      [
        makeEvent({ id: '1', type: 'shield_shown', at: OCT_20 + 9 * HOUR }),
        makeEvent({ id: '2', type: 'shield_shown', at: OCT_20 + 10 * HOUR }),
      ],
      OCT_20_NOON,
      null,
    );
    expect(streak).toBe(3);
  });


  it('an inactive today does not break the streak', () => {
    // Monday-only rule; Oct 19 (Mon) protected, Oct 20 has no window/events.
    const streak = computeStreak(
      [makeRule({ days: [1], createdAt: OCT_19 })],
      [],
      OCT_20_NOON,
      null,
    );
    expect(streak).toBe(1);
  });

  it('a fully paused day stops the streak', () => {
    // Pause covering all of Oct 19: that day has no protected time left.
    const streak = computeStreak(
      [makeRule()],
      [
        makeEvent({ id: '1', type: 'paused', ruleId: null, at: OCT_19 }),
        makeEvent({ id: '2', type: 'resumed', ruleId: null, at: OCT_20 }),
      ],
      OCT_20_NOON,
      null,
    );
    // Today is kept; Oct 19 lost its window to the pause -> stop there.
    expect(streak).toBe(1);
  });

  it('stops at the earliest evidence', () => {
    const streak = computeStreak([makeRule({ createdAt: OCT_19 })], [], OCT_20_NOON, null);
    // Evidence starts Oct 19: kept Oct 19, today kept -> 2.
    expect(streak).toBe(2);
  });

  it('returns 0 without rules and events', () => {
    expect(computeStreak([], [], OCT_20_NOON, null)).toBe(0);
  });
});
