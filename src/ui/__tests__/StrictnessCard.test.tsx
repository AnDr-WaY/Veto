import React from 'react';
import {jsonOf, renderElement} from './testUtils';
import {StrictnessCard} from '../components/StrictnessCard';

describe('StrictnessCard', () => {
  it('renders a selected hard card inverted (snapshot)', () => {
    const renderer = renderElement(
      <StrictnessCard
        mode="hard"
        title="Hard"
        description="Only Close. No way around it."
        selected
        onPress={() => undefined}
      />,
    );
    expect(jsonOf(renderer)).toMatchSnapshot();
  });

});
