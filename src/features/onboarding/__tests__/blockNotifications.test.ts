/**
 * Pure planner for block start/end notifications: which repeating local
 * notifications should exist for the given rules and toggles.
 */

import type { BlockRule } from '@/core/contracts';
import { BLOCK_NOTIFICATION_PREFIX, planBlockNotifications } from '../blockNotifications';

function makeRule(patch: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule_1',
    title: 'Social media',
    selectionRef: 'ref',
    selectionCount: 2,
    days: 'daily',
    startMin: 18 * 60,
    endMin: 21 * 60,
    strictness: 'hard',
    shieldMessage: 'Blocked.',
    paused: false,
    createdAt: 0,
    ...patch,
  };
}

const BOTH_ON = { notifyOnBlockStart: true, notifyOnBlockEnd: true };

describe('planBlockNotifications', () => {
  it('schedules a daily start + end pair for a daily rule', () => {
    const plans = planBlockNotifications([makeRule()], BOTH_ON);
    expect(plans.map((p) => p.kind).sort()).toEqual(['end', 'start']);
    expect(plans.map((p) => p.id).sort()).toEqual([
      `${BLOCK_NOTIFICATION_PREFIX}end-rule_1-daily`,
      `${BLOCK_NOTIFICATION_PREFIX}start-rule_1-daily`,
    ]);
    const start = plans.find((p) => p.kind === 'start')!;
    expect(start.hour).toBe(18);
    expect(start.minute).toBe(0);
    expect(start.weekday).toBeUndefined();
    expect(start.body).toContain('Social media');
  });

  it('maps JS weekdays (0 = Sunday) to expo triggers (1 = Sunday)', () => {
    const rule = makeRule({ id: 'rule_w', days: [0, 3] });
    const plans = planBlockNotifications([rule], BOTH_ON);
    // ids distinguish occurrences
    const startIds = plans.filter((p) => p.kind === 'start').map((p) => p.id);
    expect(new Set(startIds).size).toBe(2);
    expect(startIds).toEqual([
      `${BLOCK_NOTIFICATION_PREFIX}start-rule_w-1`,
      `${BLOCK_NOTIFICATION_PREFIX}start-rule_w-4`,
    ]);
    expect(startIds.every((id) => !id.includes('daily'))).toBe(true);
  });

  it('skips paused rules', () => {
    const plans = planBlockNotifications([makeRule({ paused: true })], BOTH_ON);
    expect(plans).toEqual([]);
  });

  it('respects each toggle independently', () => {
    const rule = makeRule();
    expect(
      planBlockNotifications([rule], { notifyOnBlockStart: true, notifyOnBlockEnd: false }).map((p) => p.kind),
    ).toEqual(['start']);
    expect(
      planBlockNotifications([rule], { notifyOnBlockStart: false, notifyOnBlockEnd: true }).map((p) => p.kind),
    ).toEqual(['end']);
    expect(planBlockNotifications([rule], { notifyOnBlockStart: false, notifyOnBlockEnd: false })).toEqual([]);
  });

  it('announces a block ending at midnight at 00:00', () => {
    const rule = makeRule({ id: 'rule_mid', endMin: 24 * 60 });
    const plans = planBlockNotifications([rule], BOTH_ON);
    const end = plans.find((p) => p.kind === 'end')!;
    expect(end.hour).toBe(0);
    expect(end.minute).toBe(0);
  });

  it('handles several rules without id collisions', () => {
    const plans = planBlockNotifications(
      [makeRule({ id: 'a' }), makeRule({ id: 'b', days: [1, 2, 3, 4, 5] })],
      BOTH_ON,
    );
    expect(new Set(plans.map((p) => p.id)).size).toBe(plans.length);
    expect(plans).toHaveLength(2 + 10);
  });
});
