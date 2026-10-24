import React from 'react';
import {jsonOf, renderElement} from './testUtils';
import {DayDial} from '../components/DayDial';

describe('DayDial', () => {
  it('renders the clock with highlighted hours and now marker (snapshot)', () => {
    const renderer = renderElement(
      <DayDial
        timeLabel="14:00"
        caption="Blocking 9:00–17:00"
        hours={[9, 10, 11, 12, 13, 14, 15, 16]}
        nowHour={14}
      />,
    );
    const json = jsonOf(renderer);
    expect(json).toMatchSnapshot();
    expect(JSON.stringify(json)).toContain('14:00');
    expect(JSON.stringify(json)).toContain('Blocking 9:00–17:00');
  });

  it('renders 24 hour ticks', () => {
    const renderer = renderElement(<DayDial timeLabel="00:00" />);
    const flat = JSON.stringify(jsonOf(renderer));
    // 24 rotated tick containers
    expect(flat.split('"rotate":').length - 1).toBe(24);
  });
});
