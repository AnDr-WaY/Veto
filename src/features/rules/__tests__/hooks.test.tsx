/**
 * Tests for the data seam and hooks: in-memory repository roundtrip,
 * validation-backed create/update/remove and live updates via subscribe.
 */

import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { InMemoryRulesRepository, createMockBackend } from '../__mocks__/mockBackend';
import { MmkvRulesRepository } from '../../storage';
import { kv } from '../../storage/kv';
import { configureRulesBackend, getRulesBackend, resetRulesBackendForTests } from '../data';
import { useRuleActions, useRules } from '../hooks';
import { defaultScheduleDraft, scheduleDraftToNewBlockRule } from '../viewModel';
import type { BlockRule, RuleActions, RulesRepository, UseRulesResult } from '@/core/contracts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function validDraftPayload(title = 'Focus') {
  const draft = {
    ...defaultScheduleDraft(),
    selectionRef: 'selection:test',
    selectionCount: 2,
    selectionLabel: 'Instagram, YouTube',
  };
  const payload = scheduleDraftToNewBlockRule(draft);
  return { ...payload, title };
}

function ruleWithId(payload: ReturnType<typeof validDraftPayload>, id: string): BlockRule {
  return { ...payload, id, paused: false, createdAt: 0 };
}

describe('InMemoryRulesRepository', () => {
  it('roundtrips save → list → get → remove', async () => {
    const repository = new InMemoryRulesRepository();
    const rule = ruleWithId(validDraftPayload(), 'r1');

    await repository.save(rule);
    expect((await repository.list()).map((item) => item.id)).toEqual(['r1']);
    expect(await repository.get('r1')).toMatchObject({ title: 'Focus' });
    expect(await repository.get('missing')).toBeNull();

    await repository.remove('r1');
    expect(await repository.list()).toEqual([]);
  });

  it('notifies subscribers on save and remove', async () => {
    const repository = new InMemoryRulesRepository();
    let changes = 0;
    const unsubscribe = repository.subscribe(() => {
      changes += 1;
    });

    await repository.save(ruleWithId(validDraftPayload(), 'r1'));
    await repository.remove('r1');
    expect(changes).toBe(2);

    unsubscribe();
    await repository.save(ruleWithId(validDraftPayload(), 'r2'));
    expect(changes).toBe(2);
  });

  it('createMockBackend starts empty; tests stage rules via seed()', async () => {
    const { repository } = createMockBackend();
    expect(await repository.list()).toEqual([]);

    repository.seed([ruleWithId(validDraftPayload('Staged'), 'staged_1')]);
    const rules = await repository.list();
    expect(rules).toHaveLength(1);
    expect(rules.every((rule) => rule.title.length > 0 && rule.endMin > rule.startMin)).toBe(true);
  });
});

describe('data seam', () => {
  afterEach(() => {
    resetRulesBackendForTests();
  });

  it('defaults to the mock backend and honors configuration', () => {
    const fallback = getRulesBackend();
    expect(fallback.engine).not.toBeNull();

    const custom = createMockBackend();
    configureRulesBackend({ repository: custom.repository, engine: custom.engine });
    expect(getRulesBackend().repository).toBe(custom.repository);

    configureRulesBackend(null);
    expect(getRulesBackend().repository).not.toBe(custom.repository);
  });
});

describe('useRules / useRuleActions', () => {
  afterEach(() => {
    resetRulesBackendForTests();
  });

  function renderHook<T>(hook: () => T): { current: T } {
    const slot: { current: T } = { current: undefined as unknown as T };
    function Probe() {
      slot.current = hook();
      return null;
    }
    act(() => {
      TestRenderer.create(<Probe />);
    });
    return slot;
  }

  it('creates, updates and removes through the contract hooks', async () => {
    const { repository, engine } = createMockBackend();
    configureRulesBackend({ repository, engine });

    const rulesSlot = renderHook<UseRulesResult>(() => useRules());
    const actionsSlot = renderHook<RuleActions>(() => useRuleActions());

    await act(async () => {
      await rulesSlot.current.refresh();
    });
    expect(rulesSlot.current.rules).toEqual([]);

    let created: BlockRule | null = null;
    await act(async () => {
      created = await actionsSlot.current.create(validDraftPayload('Created'));
    });
    expect(created).not.toBeNull();
    await act(async () => {
      await rulesSlot.current.refresh();
    });
    expect(rulesSlot.current.rules.map((rule) => rule.title)).toEqual(['Created']);

    await act(async () => {
      await actionsSlot.current.update(created!.id, { paused: true });
    });
    await act(async () => {
      await rulesSlot.current.refresh();
    });
    expect(rulesSlot.current.rules[0]?.paused).toBe(true);

    await act(async () => {
      await actionsSlot.current.remove(created!.id);
    });
    await act(async () => {
      await rulesSlot.current.refresh();
    });
    expect(rulesSlot.current.rules).toEqual([]);
  });

  it('rejects invalid payloads without touching the repository', async () => {
    const { repository } = createMockBackend();
    configureRulesBackend({ repository, engine: null });

    const actionsSlot = renderHook<RuleActions>(() => useRuleActions());
    const bad = validDraftPayload();
    bad.selectionRef = '';

    await expect(actionsSlot.current.create(bad)).rejects.toThrow(/selectionRef/);
    expect(await repository.list()).toEqual([]);
  });

  it('live-updates useRules via repository subscription', async () => {
    const { repository } = createMockBackend();
    configureRulesBackend({ repository, engine: null });

    const rulesSlot = renderHook<UseRulesResult>(() => useRules());
    await act(async () => {
      await rulesSlot.current.refresh();
    });
    expect(rulesSlot.current.rules).toEqual([]);

    await act(async () => {
      await repository.save(ruleWithId(validDraftPayload(), 'live'));
    });
    expect(rulesSlot.current.rules.map((rule) => rule.id)).toEqual(['live']);
    expect(rulesSlot.current.loading).toBe(false);
  });

  it('live-updates useRules through the MMKV-backed seam (native pause path)', async () => {
    // Mirrors app/_layout.tsx: the MMKV repository is wrapped (event-log
    // wrapper there) and the wrapper MUST forward subscribe, or pause/edit
    // never reach the screen without a remount.
    kv.clearAll();
    const inner = new MmkvRulesRepository();
    const repository: RulesRepository = {
      list: () => inner.list(),
      get: (id) => inner.get(id),
      save: (rule) => inner.save(rule),
      remove: (id) => inner.remove(id),
      subscribe: (listener) => inner.subscribe(listener),
    };
    configureRulesBackend({ repository, engine: null });

    const rulesSlot = renderHook<UseRulesResult>(() => useRules());
    await act(async () => {
      await rulesSlot.current.refresh();
    });
    expect(rulesSlot.current.rules).toEqual([]);

    // A rule appears (create)…
    await act(async () => {
      await inner.save(ruleWithId(validDraftPayload(), 'live_mmkv'));
    });
    expect(rulesSlot.current.rules.map((rule) => rule.id)).toEqual(['live_mmkv']);

    // …and a plain `update`-style save (pause toggle) re-renders the hook —
    // no explicit refresh call, no remount.
    await act(async () => {
      await inner.save({ ...(await inner.get('live_mmkv'))!, paused: true });
    });
    expect(rulesSlot.current.rules[0]?.paused).toBe(true);
  });
});
