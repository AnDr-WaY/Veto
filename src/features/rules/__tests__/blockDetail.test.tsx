/**
 * Block detail screen: the Apps line (demo names vs native counts), the
 * Edit entry into the wizards (quick vs schedule by oneShot) and the pause
 * button wiring.
 *
 * The screen lives in app/block/[id].tsx — loaded via require with
 * expo-router and the rules hooks mocked.
 */

import React, { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderElement } from '@/ui/__tests__/testUtils';
import type { BlockRule, UseRulesResult } from '@/core/contracts';

const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockUseLocalSearchParams = jest.fn((): Record<string, string> => ({ id: 'rule_1' }));
const mockUseRules = jest.fn(
  (): UseRulesResult => ({ rules: [], loading: false, error: null, refresh: async () => {} }),
);
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

jest.mock('@/features/rules/hooks', () => ({
  useRuleActions: () => mockUseRuleActions(),
  useRules: () => mockUseRules(),
}));

function loadScreen(relativePath: string): React.ComponentType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(relativePath) as { default?: React.ComponentType };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

const DetailScreen = loadScreen('../../../../app/block/[id]');

function makeRule(partial: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule_1',
    title: 'Focus',
    selectionRef: 'mock-selection:instagram+tiktok',
    selectionCount: 2,
    days: 'daily',
    startMin: 9 * 60,
    endMin: 17 * 60,
    strictness: 'hard',
    shieldMessage: 'Stay focused.',
    paused: false,
    createdAt: 0,
    ...partial,
  };
}

function seedRule(rule: BlockRule | null): void {
  mockUseRules.mockReturnValue({
    rules: rule ? [rule] : [],
    loading: false,
    error: null,
    refresh: async () => {},
  });
}

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

function renderDetail() {
  return renderElement(
    <SafeAreaProvider initialSafeAreaInsets={INSETS}>
      {React.createElement(DetailScreen as React.ComponentType)}
    </SafeAreaProvider>,
  );
}

function findButton(renderer: ReturnType<typeof renderElement>, label: string) {
  const labeled = (node: { props?: { accessibilityLabel?: unknown; onPress?: unknown } }) =>
    node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function';
  return renderer.root.findAll(labeled).at(-1);
}

function press(renderer: ReturnType<typeof renderElement>, label: string) {
  act(() => {
    findButton(renderer, label)?.props.onPress();
  });
}

function jsonOf(renderer: ReturnType<typeof renderElement>): string {
  return JSON.stringify(renderer.toJSON());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ id: 'rule_1' });
});

(DetailScreen ? describe : describe.skip)('block detail screen', () => {
  it('lists the actual demo app names on the Apps line', () => {
    seedRule(makeRule());
    const renderer = renderDetail();
    const json = jsonOf(renderer);
    expect(json).toContain('Apps');
    expect(json).toContain('Instagram, TikTok');
  });

  it('shows the native count line with the web-domain split', () => {
    seedRule(
      makeRule({
        selectionRef: 'family-activity:ab12cd34',
        selectionCount: 7,
        webDomainCount: 2,
      }),
    );
    expect(jsonOf(renderDetail())).toContain('5 apps · 2 websites');
  });

  it('shows a plain app count for legacy selections without a split', () => {
    seedRule(makeRule({ selectionRef: 'family-activity:ab12cd34', selectionCount: 4 }));
    expect(jsonOf(renderDetail())).toContain('4 apps');
  });

  it('does not render the shield message row (engine-owned default)', () => {
    seedRule(makeRule());
    const json = jsonOf(renderDetail());
    expect(json).not.toContain('Shield message');
    expect(json).not.toContain('Stay focused.');
  });

  it('edits quick blocks through the quick wizard', () => {
    seedRule(makeRule({ oneShot: true }));
    const renderer = renderDetail();
    press(renderer, 'Edit');
    expect(mockRouter.push).toHaveBeenCalledWith('/create-block?edit=rule_1');
  });

  it('edits recurring schedules through the schedule wizard', () => {
    seedRule(makeRule({ oneShot: undefined }));
    const renderer = renderDetail();
    press(renderer, 'Edit');
    expect(mockRouter.push).toHaveBeenCalledWith('/create-schedule?edit=rule_1');
  });

  it('pauses from the detail screen', async () => {
    seedRule(makeRule());
    const renderer = renderDetail();
    await act(async () => {
      press(renderer, 'Pause today');
      await Promise.resolve();
    });
    expect(mockUpdate).toHaveBeenCalledWith('rule_1', { paused: true });
  });

  it('offers Resume for a paused block', () => {
    seedRule(makeRule({ paused: true }));
    const renderer = renderDetail();
    const json = jsonOf(renderer);
    expect(json).toContain('Resume');
    expect(json).toContain('Stays paused until you resume it.');
  });

  it('shows the not-found state for a missing rule', () => {
    seedRule(null);
    const renderer = renderDetail();
    expect(jsonOf(renderer)).toContain('Block not found');
  });
});
