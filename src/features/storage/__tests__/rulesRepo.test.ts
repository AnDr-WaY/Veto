/**
 * MmkvRulesRepository behavior over the in-memory KV fallback (jest):
 * persistence roundtrip plus the change notifications that drive
 * useRules()' live updates (pause/edit must reach the screen in the same
 * tick — no polling, no refocus).
 */

import { MmkvRulesRepository } from '../rulesRepo';
import { kv } from '../kv';
import type { BlockRule } from '../../../core/contracts';
import { validateRule } from '../../../core/contracts';

function makeRule(partial: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule_1',
    title: 'Focus',
    selectionRef: 'selection:1',
    selectionCount: 2,
    days: 'daily',
    startMin: 540,
    endMin: 1020,
    strictness: 'hard',
    shieldMessage: 'Focus.',
    paused: false,
    createdAt: 0,
    ...partial,
  };
}

beforeEach(() => {
  kv.clearAll();
});

describe('MmkvRulesRepository', () => {
  it('roundtrips save → list → get → remove', async () => {
    const repository = new MmkvRulesRepository();

    await repository.save(makeRule());
    expect((await repository.list()).map((rule) => rule.id)).toEqual(['rule_1']);
    expect(await repository.get('rule_1')).toMatchObject({ title: 'Focus' });
    expect(await repository.get('missing')).toBeNull();

    await repository.remove('rule_1');
    expect(await repository.list()).toEqual([]);
  });

  it('notifies subscribers on save and remove (useRules live updates)', async () => {
    const repository = new MmkvRulesRepository();
    let changes = 0;
    const unsubscribe = repository.subscribe(() => {
      changes += 1;
    });

    await repository.save(makeRule());
    await repository.save(makeRule({ id: 'rule_2' }));
    await repository.remove('rule_1');
    expect(changes).toBe(3);

    unsubscribe();
    await repository.save(makeRule({ id: 'rule_3' }));
    expect(changes).toBe(3);
  });

  it('does not notify when remove misses and rejects invalid saves', async () => {
    const repository = new MmkvRulesRepository();
    let changes = 0;
    repository.subscribe(() => {
      changes += 1;
    });

    await repository.remove('ghost');
    expect(changes).toBe(0);

    const invalid = makeRule({ endMin: 540, startMin: 540 });
    expect(validateRule(invalid)).not.toEqual([]);
    await expect(repository.save(invalid)).rejects.toThrow(/invalid rule/);
    expect(changes).toBe(0);
  });
});
