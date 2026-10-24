import React from 'react';
import {jsonOf, renderElement} from './testUtils';
import {Demo} from '../Demo';

/** Smoke test: the gallery must render every design-system component. */
describe('Demo', () => {
  it('renders the full gallery without throwing', () => {
    const renderer = renderElement(<Demo />);
    const json = jsonOf(renderer);
    expect(json).not.toBeNull();

    const flat = JSON.stringify(json);
    for (const marker of [
      'Veto design system',
      'Block now', // Button
      'Off', // BlockChip
      '14:00', // DayDial
      'Threshold', // TimeStepper
      'No rules yet', // EmptyState
      'Hard block', // ShieldLayout
    ]) {
      expect(flat).toContain(marker);
    }
  });
});
