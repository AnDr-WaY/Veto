import {
  createMemoryBackend,
  readMirror,
  removeMirrorEntry,
  shieldMessageKey,
  writeMirrorEntry,
  writeShieldMeta,
} from '../appGroupStore';
import type { BlockRule } from '../../../core/contracts';

function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'r1',
    title: 'Focus',
    selectionRef: 'sel_r1',
    selectionCount: 2,
    days: 'daily',
    startMin: 540,
    endMin: 600,
    strictness: 'hard',
    shieldMessage: 'Stay focused',
    paused: false,
    createdAt: 0,
    ...overrides,
  };
}

describe('appGroupStore — mirror', () => {
  it('stores and removes entries over any backend', () => {
    const backend = createMemoryBackend();
    expect(readMirror(backend)).toEqual({});

    writeMirrorEntry(backend, 'r1', {
      rule: makeRule(),
      activities: ['veto_rule_r1'],
      appliedAt: 111,
    });
    expect(readMirror(backend).r1?.activities).toEqual(['veto_rule_r1']);

    removeMirrorEntry(backend, 'r1');
    expect(readMirror(backend)).toEqual({});
    // Removing a missing entry is a no-op.
    removeMirrorEntry(backend, 'r1');
  });
});

describe('appGroupStore — shield meta', () => {
  it('writes message/end/icon for the extension', () => {
    const backend = createMemoryBackend();
    writeShieldMeta(backend, makeRule(), '10:00');
    expect(backend.get<string>(shieldMessageKey('sel_r1'))).toBe('Stay focused');
    expect(backend.get<string>('veto_shield_end_sel_r1')).toBe('10:00');
    expect(backend.get<string>('veto_shield_icon_sel_r1')).toBe('lock.shield.fill');

    writeShieldMeta(backend, makeRule({ strictness: 'threshold' }), '10:00');
    expect(backend.get<string>('veto_shield_icon_sel_r1')).toBe('hourglass');
  });
});

