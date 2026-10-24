import { MockBlockingEngine } from '../mockEngine';
import { createMemoryBackend, readMirror } from '../appGroupStore';
import type { VetoStoreBackend } from '../appGroupStore';
import type { BlockRule } from '../../../core/contracts';

function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'r1',
    title: 'Focus',
    selectionRef: 'sel_r1',
    selectionCount: 2,
    days: 'daily',
    startMin: 0,
    endMin: 24 * 60,
    strictness: 'hard',
    shieldMessage: 'Stay focused',
    paused: false,
    createdAt: 0,
    ...overrides,
  };
}

const NOW = new Date(2026, 9, 21, 12, 0).getTime();

function newEngine() {
  return new MockBlockingEngine(createMemoryBackend(), () => NOW);
}

describe('MockBlockingEngine', () => {
  it('authorize approves once and stays stable', async () => {
    const engine = newEngine();
    await expect(engine.authorize()).resolves.toBe('approved');
    await expect(engine.authorize()).resolves.toBe('approved');
  });

  it('apply validates and mirrors the rule', async () => {
    const backend = createMemoryBackend();
    const engine = new MockBlockingEngine(backend, () => NOW);
    await engine.apply(makeRule());
    expect(readMirrorFor(backend, 'r1')).toBeDefined();

    await expect(engine.apply(makeRule({ startMin: 600, endMin: 600 }))).rejects.toThrow(/invalid rule/);
  });



  it('isShielded reflects window and pause', async () => {
    const backend = createMemoryBackend();
    const engine = new MockBlockingEngine(backend, () => NOW);
    const insideRule = makeRule({ startMin: 11 * 60, endMin: 13 * 60 });

    await engine.apply(insideRule);
    expect(engine.isShielded(insideRule, NOW)).toBe(true);

    await engine.pauseAll(30);
    expect(engine.isShielded(insideRule, NOW)).toBe(false);
    await engine.resumeAll();
    expect(engine.isShielded(insideRule, NOW)).toBe(true);

    const thresholdRule = makeRule({ strictness: 'threshold', thresholdMin: 10 });
    expect(engine.isShielded(thresholdRule, NOW)).toBe(false);

    const outsideRule = makeRule({ startMin: 22 * 60, endMin: 23 * 60 });
    expect(engine.isShielded(outsideRule, NOW)).toBe(false);
  });

  it('remove clears the mirror; pause validates input', async () => {
    const backend = createMemoryBackend();
    const engine = new MockBlockingEngine(backend, () => NOW);
    await engine.apply(makeRule());
    await engine.remove('r1');
    expect(readMirrorFor(backend, 'r1')).toBeUndefined();
    await expect(engine.remove('missing')).resolves.toBeUndefined();
    await expect(engine.pauseAll(0)).rejects.toThrow(RangeError);
  });

});

function readMirrorFor(backend: VetoStoreBackend, ruleId: string) {
  return readMirror(backend)[ruleId];
}
