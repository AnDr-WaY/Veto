import { MemoryKV, createKV, type StringKV } from '../kv';
import { MmkvRulesRepository } from '../rulesRepo';
import { DEFAULT_VETO_SETTINGS, MmkvSettingsRepository } from '../settingsRepo';
import type { BlockRule } from '../../../core/contracts';

/** Valid base rule; tests override fields. */
function makeRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule-1',
    title: 'Deep work',
    selectionRef: 'sel-1',
    selectionCount: 3,
    days: 'daily',
    startMin: 540,
    endMin: 1020,
    strictness: 'hard',
    shieldMessage: 'Focus time',
    paused: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('MemoryKV', () => {
  let store: StringKV;

  beforeEach(() => {
    store = new MemoryKV();
  });

  it('roundtrips strings', () => {
    expect(store.getString('missing')).toBeUndefined();
    store.set('a', '1');
    expect(store.getString('a')).toBe('1');
    store.set('a', '2');
    expect(store.getString('a')).toBe('2');
    store.delete('a');
    expect(store.contains('a')).toBe(false);
  });

  it('lists keys and clears all', () => {
    store.set('a', '1');
    store.set('b', '2');
    expect(new Set(store.getAllKeys())).toEqual(new Set(['a', 'b']));
    store.clearAll();
    expect(store.getAllKeys()).toEqual([]);
  });
});

describe('createKV fallback', () => {
  it('falls back to an in-memory store when the App Group is unavailable', () => {
    const store = createKV();
    // Under jest the native module never answers the read-only probe.
    expect(store).toBeInstanceOf(MemoryKV);
    store.set('k', 'v');
    expect(store.getString('k')).toBe('v');
  });
});

describe('MmkvRulesRepository roundtrip', () => {
  let store: StringKV;
  let repo: MmkvRulesRepository;

  beforeEach(() => {
    store = new MemoryKV();
    repo = new MmkvRulesRepository(store);
  });

  it('returns empty list for a fresh store', async () => {
    await expect(repo.list()).resolves.toEqual([]);
    await expect(repo.get('x')).resolves.toBeNull();
  });

  it('saves, lists sorted by creation, and gets by id', async () => {
    const first = makeRule({ id: 'a', createdAt: 200 });
    const second = makeRule({ id: 'b', createdAt: 100 });
    await repo.save(first);
    await repo.save(second);

    const list = await repo.list();
    expect(list.map((rule) => rule.id)).toEqual(['b', 'a']);
    await expect(repo.get('a')).resolves.toEqual(first);
  });

  it('overwrites a rule with the same id', async () => {
    await repo.save(makeRule({ id: 'a', title: 'Old' }));
    await repo.save(makeRule({ id: 'a', title: 'New' }));
    const rule = await repo.get('a');
    expect(rule?.title).toBe('New');
    expect(await repo.list()).toHaveLength(1);
  });

  it('persists across repository instances (same storage)', async () => {
    await repo.save(makeRule({ id: 'a' }));
    const secondRepo = new MmkvRulesRepository(store);
    await expect(secondRepo.get('a')).resolves.toMatchObject({ id: 'a' });
  });

  it('rejects invalid rules on save', async () => {
    await expect(repo.save(makeRule({ startMin: 600, endMin: 600 }))).rejects.toThrow(
      /invalid rule/,
    );
    expect(await repo.list()).toEqual([]);
  });

  it('removes rules', async () => {
    await repo.save(makeRule({ id: 'a' }));
    await repo.save(makeRule({ id: 'b' }));
    await repo.remove('a');
    expect((await repo.list()).map((rule) => rule.id)).toEqual(['b']);
    // Removing an unknown id is a no-op.
    await expect(repo.remove('zzz')).resolves.toBeUndefined();
  });

  it('survives corrupt JSON on disk', async () => {
    store.set('veto.rules.v1', '{not json');
    await expect(repo.list()).resolves.toEqual([]);
    await repo.save(makeRule({ id: 'a' }));
    expect(await repo.list()).toHaveLength(1);
  });
});

describe('MmkvSettingsRepository roundtrip', () => {
  let store: StringKV;
  let repo: MmkvSettingsRepository;

  beforeEach(() => {
    store = new MemoryKV();
    repo = new MmkvSettingsRepository(store);
  });

  it('returns defaults for a fresh store', async () => {
    await expect(repo.get()).resolves.toEqual(DEFAULT_VETO_SETTINGS);
    await expect(repo.getFull()).resolves.toEqual(DEFAULT_VETO_SETTINGS);
  });

  it('patches contract fields (set) and keeps the rest', async () => {
    await repo.set({ hapticsEnabled: false, globalPausedUntil: 123 });
    const full = await repo.getFull();
    expect(full.hapticsEnabled).toBe(false);
    expect(full.globalPausedUntil).toBe(123);
    expect(full.theme).toBe(DEFAULT_VETO_SETTINGS.theme);
  });

  it('patches extended fields (setFull) and is visible through the contract get()', async () => {
    await repo.setFull({ theme: 'dark', notifyOnBlockStart: false });
    await expect(repo.get()).resolves.toMatchObject({
      theme: 'dark',
      notifyOnBlockStart: false,
      hapticsEnabled: true,
      globalPausedUntil: null,
    });
  });

  it('sanitizes malformed values back to defaults', async () => {
    store.set(
      'veto.settings.v1',
      JSON.stringify({
        theme: 'neon',
        dailyGraceLimit: -5,
        globalPausedUntil: 'soon',
        hapticsEnabled: 'yes',
      }),
    );
    const full = await repo.getFull();
    expect(full).toEqual(DEFAULT_VETO_SETTINGS);
  });

  it('readSync hydrates synchronously with persisted values', async () => {
    await repo.setFull({ theme: 'light' });
    const secondRepo = new MmkvSettingsRepository(store);
    expect(secondRepo.readSync().theme).toBe('light');
  });
});
