import {
  DEFAULT_SETTINGS,
  isQuarterMinute,
  validateRule,
  type BlockRule,
} from '../contracts';

/** Valid base rule; individual tests override fields. */
function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule-1',
    title: 'Focus morning',
    selectionRef: 'sel/abc123',
    selectionCount: 3,
    days: 'daily',
    startMin: 540,
    endMin: 720,
    strictness: 'hard',
    shieldMessage: 'Stay focused.',
    paused: false,
    createdAt: 1760000000000,
    ...overrides,
  };
}

describe('isQuarterMinute', () => {
  it('accepts multiples of the 5-minute grid within the day', () => {
    expect(isQuarterMinute(0)).toBe(true);
    expect(isQuarterMinute(545)).toBe(true);
    expect(isQuarterMinute(540)).toBe(true);
    expect(isQuarterMinute(1440)).toBe(true);
  });

  it('rejects off-grid or out-of-range values', () => {
    expect(isQuarterMinute(7)).toBe(false);
    expect(isQuarterMinute(15.5)).toBe(false);
    expect(isQuarterMinute(-15)).toBe(false);
    expect(isQuarterMinute(1441)).toBe(false);
  });
});

describe('validateRule', () => {
  it('accepts a valid rule', () => {
    expect(validateRule(makeRule())).toEqual([]);
  });

  it('accepts a valid threshold rule', () => {
    expect(validateRule(makeRule({ strictness: 'threshold', thresholdMin: 10 }))).toEqual([]);
  });

  it('requires thresholdMin for threshold rules', () => {
    expect(validateRule(makeRule({ strictness: 'threshold' }))).toContain(
      'thresholdMin must be >= 1 for threshold rules',
    );
  });

  it('accepts overnight windows and rejects zero-length ones', () => {
    // endMin < startMin crosses midnight (23:00 -> 09:00).
    expect(validateRule(makeRule({ startMin: 720, endMin: 540 }))).toEqual([]);
    expect(validateRule(makeRule({ startMin: 720, endMin: 720 }))).toContain(
      'window must be at least one grid step long',
    );

    // Quick blocks start at the current minute — any whole minute is legal.
    expect(validateRule(makeRule({ startMin: 541 }))).toEqual([]);

    const malformed = validateRule(makeRule({ startMin: 541.5 }));
    expect(malformed.some((p) => p.startsWith('startMin'))).toBe(true);

    // The end stays on the 15-minute grid.
    const offGridEnd = validateRule(makeRule({ endMin: 541 }));
    expect(offGridEnd.some((p) => p.startsWith('endMin'))).toBe(true);
  });

  it('validates days shape', () => {
    expect(validateRule(makeRule({ days: [] }))).toContain(
      'days must be "daily" or a non-empty list of weekdays 0-6',
    );
    // Intentionally invalid weekday (9) to assert the days guard — widened via cast.
    expect(
      validateRule(makeRule({ days: [1, 9] as unknown as BlockRule['days'] })),
    ).toContain('days must be "daily" or a non-empty list of weekdays 0-6');
    expect(validateRule(makeRule({ days: [1, 3] }))).toEqual([]);
  });


  it('rejects empty title/selection', () => {
    expect(validateRule(makeRule({ title: '  ' }))).toContain('title must not be empty');
    expect(validateRule(makeRule({ selectionRef: '' }))).toContain(
      'selectionRef must not be empty',
    );
  });

  it('defaults exported for settings are sane', () => {
    expect(DEFAULT_SETTINGS).toEqual({ globalPausedUntil: null, hapticsEnabled: true });
  });
});
