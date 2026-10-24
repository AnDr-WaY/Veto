import React from 'react';
import {jsonOf, renderElement} from './testUtils';
import {Button} from '../components/Button';

describe('Button', () => {
  it('renders a primary button (snapshot)', () => {
    const renderer = renderElement(<Button label="Block now" onPress={() => undefined} />);
    expect(jsonOf(renderer)).toMatchSnapshot();
  });

  it('renders a disabled secondary button (snapshot)', () => {
    const renderer = renderElement(<Button label="Options" variant="secondary" disabled />);
    expect(jsonOf(renderer)).toMatchSnapshot();
  });
});
