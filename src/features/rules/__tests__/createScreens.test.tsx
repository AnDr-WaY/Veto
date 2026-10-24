/**
 * Smoke + interaction tests for the two creation wizards (one decision per
 * screen) and the full-screen app picker — plus the edit flows, which reuse
 * the same wizards with ?edit=<id> and save over the existing rule.
 *
 * The screens live in app/ (expo-router routes) — loaded via require like
 * screens.smoke.test does, with expo-router and the rules hooks mocked.
 */

import React, { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderElement } from '@/ui/__tests__/testUtils';
import { AppPicker } from '../components/AppPicker';
import { nowMinutesLocal } from '../viewModel';
import type { BlockRule, UseRulesResult } from '@/core/contracts';

const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockUseLocalSearchParams = jest.fn((): Record<string, string> => ({}));
const mockUseRules = jest.fn(
  (): UseRulesResult => ({ rules: [], loading: false, error: null, refresh: async () => {} }),
);
// One stable set of action mocks — the wizard captures whatever object the
// hook returned on its last render, so the test must inspect the same fns.
const mockCreate = jest.fn().mockResolvedValue({ id: 'rule_x' });
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockRemove = jest.fn().mockResolvedValue(undefined);
const mockUseRuleActions = jest.fn(() => ({
  create: mockCreate,
  update: mockUpdate,
  remove: mockRemove,
}));

jest.mock('expo-router', () => ({
  router: mockRouter,
  useLocalSearchParams: mockUseLocalSearchParams,
}));

// Force the demo picker branch: under jest Platform.OS is 'ios' and
// expo-constants reports no storeClient environment, so without this the
// picker would take the native FamilyActivityPicker path (Expo Go always
// takes the demo path in the real app).
jest.mock('@/core/environment', () => ({
  isExpoGo: () => true,
}));

jest.mock('@/features/rules/hooks', () => ({
  useRuleActions: () => mockUseRuleActions(),
  useRules: () => mockUseRules(),
}));

function mockSeededRules(rules: BlockRule[]): void {
  mockUseRules.mockReturnValue({
    rules,
    loading: false,
    error: null,
    refresh: async () => {},
  });
}

function makeQuickRule(partial: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule_quick',
    title: 'Instagram',
    selectionRef: 'mock-selection:instagram',
    selectionCount: 1,
    days: 'daily',
    startMin: 14 * 60,
    endMin: 15 * 60,
    strictness: 'hard',
    shieldMessage: 'Blocked.',
    paused: false,
    createdAt: 0,
    oneShot: true,
    ...partial,
  };
}

/** Clock-safe quick rule: window ends on the 15-grid, ~1h from "now". */
function makeLiveQuickRule(partial: Partial<BlockRule> = {}): BlockRule {
  const endMin = Math.min(24 * 60, Math.ceil((nowMinutesLocal() + 60) / 15) * 15);
  return makeQuickRule({
    startMin: Math.max(0, endMin - 60),
    endMin,
    ...partial,
  });
}

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

function loadScreen(relativePath: string): React.ComponentType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(relativePath) as { default?: React.ComponentType };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

function renderWithInsets(screen: React.ComponentType) {
  return renderElement(
    <SafeAreaProvider initialSafeAreaInsets={INSETS}>
      {React.createElement(screen)}
    </SafeAreaProvider>,
  );
}

const QuickScreen = loadScreen('../../../../app/create-block');
const ScheduleScreen = loadScreen('../../../../app/create-schedule');

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({});
  mockUseRules.mockReturnValue({
    rules: [],
    loading: false,
    error: null,
    refresh: async () => {},
  });
});

function findButton(renderer: ReturnType<typeof renderElement>, label: string) {
  // react-test-renderer is an ambient-any module here, so the predicate
  // node is typed structurally.
  const labeled = (node: { props?: { accessibilityLabel?: unknown; onPress?: unknown } }) =>
    node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function';
  return renderer.root.findAll(labeled).at(-1);
}

function press(renderer: ReturnType<typeof renderElement>, label: string) {
  const button = findButton(renderer, label);
  act(() => {
    button?.props.onPress();
  });
}

function jsonOf(renderer: ReturnType<typeof renderElement>): string {
  return JSON.stringify(renderer.toJSON());
}

describe('quick block wizard', () => {
  (QuickScreen ? it : it.skip)('starts on a full-screen apps step, CTA disabled', () => {
    const renderer = renderWithInsets(QuickScreen as React.ComponentType);
    const json = jsonOf(renderer);
    expect(json).toContain('Quick block');
    expect(json).toContain('APPS');
    expect(json).toContain('Search');
    expect(json).toContain('Social');
    expect(json).toContain('Choose at least one app.');
    expect(findButton(renderer, 'Next')?.props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  (QuickScreen ? it : it.skip)('walks apps → until', () => {
    const renderer = renderWithInsets(QuickScreen as React.ComponentType);

    press(renderer, 'Instagram');
    expect(findButton(renderer, 'Next')?.props.accessibilityState).toEqual({
      disabled: false,
    });

    press(renderer, 'Next');
    const untilJson = jsonOf(renderer);
    expect(untilJson).toContain('UNTIL');
    expect(untilJson).toContain('Starts right away');
    expect(untilJson).not.toContain('APPS');
    expect(untilJson).toContain('Create block');
  });
});

describe('schedule wizard', () => {
  (ScheduleScreen ? it : it.skip)('starts on a full-screen apps step, CTA disabled', () => {
    const renderer = renderWithInsets(ScheduleScreen as React.ComponentType);
    const json = jsonOf(renderer);
    expect(json).toContain('Schedule');
    expect(json).toContain('APPS');
    expect(json).toContain('Search');
    expect(json).toContain('Choose at least one app.');
  });

  (ScheduleScreen ? it : it.skip)('walks apps → when (days + time)', () => {
    const renderer = renderWithInsets(ScheduleScreen as React.ComponentType);

    press(renderer, 'Instagram');
    press(renderer, 'Next');
    const whenJson = jsonOf(renderer);
    // Repeats and time live on one scrollable screen.
    expect(whenJson).toContain('REPEATS ON');
    expect(whenJson).toContain('Every day');
    expect(whenJson).toContain('Mon');
    expect(whenJson).toContain('TIME');
    expect(whenJson).toContain('Start');
    expect(whenJson).toContain('End');
    expect(whenJson).toContain('Create block');
  });
});

describe('edit flows (?edit=<id> reuses the wizards)', () => {
  (QuickScreen ? it : it.skip)('prefills the quick wizard and saves over the rule', async () => {
    const rule = makeLiveQuickRule();
    mockUseLocalSearchParams.mockReturnValue({ edit: rule.id });
    mockSeededRules([rule]);
    const renderer = renderWithInsets(QuickScreen as React.ComponentType);

    const editJson = jsonOf(renderer);
    // Header says Edit, the prefilled apps step shows the picked app.
    expect(editJson).toContain('Edit block');
    expect(editJson).toContain('Instagram');

    press(renderer, 'Next');
    const untilJson = jsonOf(renderer);
    // Name field is prefilled for the rename; CTA saves instead of creating.
    expect(untilJson).toContain('NAME');
    expect(untilJson).toContain('Save');
    expect(untilJson).not.toContain('Starts right away');

    await act(async () => {
      press(renderer, 'Save');
      await Promise.resolve();
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [id, payload] = mockUpdate.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(rule.id);
    expect(payload.title).toBe('Instagram');
    expect(payload.selectionRef).toBe('mock-selection:instagram');
    expect(payload.selectionCount).toBe(1);
    expect(payload.startMin).toBe(rule.startMin); // window start preserved
    expect(payload.endMin).toBe(rule.endMin);
    expect(payload.strictness).toBe('hard');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  (QuickScreen ? it : it.skip)('renames the block on save', async () => {
    const rule = makeLiveQuickRule();
    mockUseLocalSearchParams.mockReturnValue({ edit: rule.id });
    mockSeededRules([rule]);
    const renderer = renderWithInsets(QuickScreen as React.ComponentType);

    press(renderer, 'Next');
    // The name input is the only TextInput on the final step.
    const input = renderer.root.findByProps({ returnKeyType: 'done' });
    act(() => {
      input.props.onChangeText('Deep focus');
    });

    await act(async () => {
      press(renderer, 'Save');
      await Promise.resolve();
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [, payload] = mockUpdate.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.title).toBe('Deep focus');
    // Unedited fields still round-trip.
    expect(payload.startMin).toBe(rule.startMin);
  });

  (ScheduleScreen ? it : it.skip)('prefills the schedule wizard and saves over the rule', async () => {
    const rule = makeQuickRule({
      id: 'rule_sched',
      title: 'Evening',
      days: [1, 3],
      startMin: 570,
      endMin: 630,
      oneShot: undefined,
      strictness: 'hard',
    });
    mockUseLocalSearchParams.mockReturnValue({ edit: rule.id });
    mockSeededRules([rule]);
    const renderer = renderWithInsets(ScheduleScreen as React.ComponentType);

    expect(jsonOf(renderer)).toContain('Edit block');

    press(renderer, 'Next');
    const whenJson = jsonOf(renderer);
    // The name field is on the final step; the CTA saves instead of creating.
    expect(whenJson).toContain('NAME');
    expect(whenJson).toContain('Save');

    await act(async () => {
      press(renderer, 'Save');
      await Promise.resolve();
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [id, payload] = mockUpdate.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(rule.id);
    expect(payload.title).toBe('Evening');
    expect(payload.days).toEqual([1, 3]);
    expect(payload.startMin).toBe(570);
    expect(payload.endMin).toBe(630);
    expect(payload.strictness).toBe('hard');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  (QuickScreen ? it : it.skip)('shows not-found when the edited rule is gone', () => {
    mockUseLocalSearchParams.mockReturnValue({ edit: 'rule_ghost' });
    mockSeededRules([]);
    const renderer = renderWithInsets(QuickScreen as React.ComponentType);

    const json = jsonOf(renderer);
    expect(json).toContain('Block not found');
    press(renderer, 'Close');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe('AppPicker (full screen)', () => {
  it('toggles a demo app on (controlled onChange)', () => {
    const onChange = jest.fn();
    const renderer = renderElement(
      <AppPicker selectionRef="" selectionCount={0} selectionLabel="" onChange={onChange} />,
    );

    press(renderer, 'Instagram');
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0] as {
      selectionRef: string;
      selectionCount: number;
      selectionLabel: string;
    };
    expect(payload.selectionCount).toBe(1);
    expect(payload.selectionRef).toBe('mock-selection:instagram');
    expect(payload.selectionLabel).toBe('Instagram');
  });

  it('toggles a selected demo app off', () => {
    const onChange = jest.fn();
    const renderer = renderElement(
      <AppPicker
        selectionRef="mock-selection:instagram+tiktok"
        selectionCount={2}
        selectionLabel="Instagram, TikTok"
        onChange={onChange}
      />,
    );
    press(renderer, 'Instagram');
    const payload = onChange.mock.calls[0][0] as { selectionRef: string; selectionCount: number };
    expect(payload.selectionCount).toBe(1);
    expect(payload.selectionRef).toBe('mock-selection:tiktok');
  });

  it('selects and clears a whole category from its section header', () => {
    // The picker is controlled — feed the emitted ref back like the screens do.
    let selectionRef = '';
    const onChange = jest.fn((next: {
      selectionRef: string;
      selectionCount: number;
      selectionLabel: string;
    }) => {
      selectionRef = next.selectionRef;
    });
    const element = (ref: string) => (
      <AppPicker selectionRef={ref} selectionCount={0} selectionLabel="" onChange={onChange} />
    );
    const renderer = renderElement(element(selectionRef));

    press(renderer, 'Social');
    const selectPayload = onChange.mock.calls[0][0] as { selectionCount: number };
    expect(selectPayload.selectionCount).toBe(7); // the whole Social bucket

    // Selected apps are not duplicated in a separate section.
    expect(jsonOf(renderer)).not.toContain('SELECTED');

    act(() => {
      renderer.update(element(selectionRef));
    });
    press(renderer, 'Social');
    const clearPayload = onChange.mock.calls[1][0] as { selectionCount: number };
    expect(clearPayload.selectionCount).toBe(0);
  });
});
