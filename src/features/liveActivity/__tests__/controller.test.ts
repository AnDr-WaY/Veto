/**
 * Decision logic of the lock-screen activity controller (pure parts only —
 * now, rules, support and the pause deadline are injected, so no native
 * module or store is involved).
 */

import type { BlockRule } from '../../../core/contracts';
import {
  activeBlock,
  blockEndsAt,
  decideLiveActivity,
  sameActivityPayload,
  type LiveActivityDecisionInput,
} from '../controller';
import { liveActivityStrings } from '../strings';

/** Wednesday — a weekday unlike any other in the fixtures below. */
const WEDNESDAY = new Date(2026, 9, 21, 10, 30).getTime();
const THURSDAY = new Date(2026, 9, 22, 10, 30).getTime();

function rule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule_1',
    title: 'Deep work',
    selectionRef: 'sel_1',
    selectionCount: 3,
    days: 'daily',
    startMin: 9 * 60,
    endMin: 12 * 60,
    strictness: 'hard',
    shieldMessage: '',
    paused: false,
    createdAt: 0,
    ...overrides,
  };
}

const READY_INPUT: LiveActivityDecisionInput = {
  enabled: true,
  mode: 'both',
  support: 'ready',
  rules: [],
  pausedUntil: null,
  now: WEDNESDAY,
};

function decide(overrides: Partial<LiveActivityDecisionInput> = {}): ReturnType<typeof decideLiveActivity> {
  return decideLiveActivity({ ...READY_INPUT, ...overrides });
}

describe('activeBlock', () => {
  it('returns the rule whose window contains now', () => {
    expect(activeBlock([rule()], WEDNESDAY, null)?.id).toBe('rule_1');
  });

  it('ignores paused rules and windows that do not contain now', () => {
    const rules = [
      rule({ id: 'paused', paused: true }),
      rule({ id: 'late', startMin: 13 * 60, endMin: 14 * 60 }),
    ];
    expect(activeBlock(rules, WEDNESDAY, null)).toBeNull();
  });

  it('ignores rules whose weekday does not match', () => {
    expect(activeBlock([rule({ days: [3] })], THURSDAY, null)).toBeNull();
    expect(activeBlock([rule({ days: [3] })], WEDNESDAY, null)?.id).toBe('rule_1');
  });

  it('returns null while the global pause is active, works again after it', () => {
    const pauseUntil = WEDNESDAY + 30 * 60_000;
    expect(activeBlock([rule()], WEDNESDAY, pauseUntil)).toBeNull();
    expect(activeBlock([rule()], pauseUntil + 1, pauseUntil)?.id).toBe('rule_1');
  });

  it('picks the running block that ends soonest', () => {
    const rules = [
      rule({ id: 'long', title: 'Long', endMin: 17 * 60 }),
      rule({ id: 'short', title: 'Short', endMin: 11 * 60 }),
    ];
    expect(activeBlock(rules, WEDNESDAY, null)?.id).toBe('short');
  });
});

describe('decideLiveActivity', () => {
  it('shows nothing when the native side cannot start an activity', () => {
    for (const support of ['missing', 'disabled'] as const) {
      expect(decide({ support })).toBeNull();
    }
  });

  it('shows nothing while the feature switch is off', () => {
    expect(decide({ enabled: false, rules: [rule()] })).toBeNull();
  });

  it('day mode counts down to the end of the day under the app name', () => {
    expect(decide({ mode: 'day', rules: [rule()] })).toEqual({
      title: liveActivityStrings.dayTitle,
      endsAt: blockEndsAt(rule({ endMin: 24 * 60 }), WEDNESDAY),
    });
  });

  it('block mode shows the running block with its window end today', () => {
    expect(decide({ mode: 'block', rules: [rule()] })).toEqual({
      title: 'Deep work',
      endsAt: blockEndsAt(rule(), WEDNESDAY),
    });
    expect(blockEndsAt(rule(), WEDNESDAY)).toBe(
      new Date(2026, 9, 21, 12, 0).getTime(),
    );
  });

  it('block mode shows nothing when no block is running (incl. global pause)', () => {
    expect(decide({ mode: 'block' })).toBeNull();
    expect(
      decide({ mode: 'block', rules: [rule()], pausedUntil: WEDNESDAY + 60_000 }),
    ).toBeNull();
  });

  it('both mode lets the running block override the day countdown', () => {
    expect(decide({ mode: 'both', rules: [rule()] })).toEqual({
      title: 'Deep work',
      endsAt: blockEndsAt(rule(), WEDNESDAY),
    });
    expect(decide({ mode: 'both' })).toEqual({
      title: liveActivityStrings.dayTitle,
      endsAt: blockEndsAt(rule({ endMin: 24 * 60 }), WEDNESDAY),
    });
  });

  it('both mode falls back to the day countdown while the global pause is on', () => {
    expect(
      decide({ mode: 'both', rules: [rule()], pausedUntil: WEDNESDAY + 60_000 }),
    ).toEqual({
      title: liveActivityStrings.dayTitle,
      endsAt: blockEndsAt(rule({ endMin: 24 * 60 }), WEDNESDAY),
    });
  });
});

describe('sameActivityPayload', () => {
  const payload = { title: 'Deep work', endsAt: 1_000_000 };

  it('accepts the same countdown within a minute of drift', () => {
    expect(sameActivityPayload(payload, { ...payload, endsAt: payload.endsAt + 60_000 })).toBe(true);
  });

  it('rejects a meaningfully different end or a different activity type', () => {
    expect(sameActivityPayload(payload, { ...payload, endsAt: payload.endsAt + 61_000 })).toBe(false);
    expect(sameActivityPayload(payload, { title: 'Veto', endsAt: payload.endsAt })).toBe(false);
  });
});
