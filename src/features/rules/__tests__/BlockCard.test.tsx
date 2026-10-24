/**
 * Smoke: BlockCard renders block summary + state chip for every state.
 */

import { renderElement } from '@/ui/__tests__/testUtils';
import { BlockCard } from '../components/BlockCard';
import type { BlockRule } from '@/core/contracts';

function makeRule(partial: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'r1',
    title: 'Morning focus',
    selectionRef: 'selection:1',
    selectionCount: 3,
    days: 'daily',
    startMin: 540,
    endMin: 600,
    strictness: 'hard',
    shieldMessage: 'Focus.',
    paused: false,
    createdAt: 0,
    ...partial,
  };
}

describe('BlockCard', () => {
  it('renders title, range and state chip', () => {
    const json = renderElement(<BlockCard rule={makeRule()} nowMin={570} weekday={3} />).toJSON();
    expect(json).not.toBeNull();
    expect(JSON.stringify(json)).toContain('Morning focus');
    expect(JSON.stringify(json)).toContain('09:00 – 10:00');
    expect(JSON.stringify(json)).toContain('Active');
  });

  it('marks paused and off-day rules accordingly', () => {
    const paused = renderElement(
      <BlockCard rule={makeRule({ paused: true })} nowMin={570} weekday={3} />,
    ).toJSON();
    expect(JSON.stringify(paused)).toContain('Paused');

    const offDay = renderElement(
      <BlockCard rule={makeRule({ days: [0] })} nowMin={570} weekday={3} />,
    ).toJSON();
    expect(JSON.stringify(offDay)).toContain('Off day');
  });

  it('compact mode hides the state chip (compact layouts)', () => {
    const json = renderElement(
      <BlockCard rule={makeRule()} nowMin={570} weekday={3} compact />,
    ).toJSON();
    expect(JSON.stringify(json)).not.toContain('Active');
  });

  it('labels one-shot blocks "One time" instead of "Every day"', () => {
    const json = JSON.stringify(
      renderElement(<BlockCard rule={makeRule({ oneShot: true })} nowMin={570} weekday={3} />).toJSON(),
    );
    expect(json).toContain('One time');
    expect(json).not.toContain('Every day');
  });
});
