/**
 * Global Jest setup.
 *
 * @react-native-picker/picker has no jest preset of its own: its main entry
 * asks react-native for a native component. The jest-expo RN mock handles
 * most views, but the picker also walks NativeModules paths that differ per
 * platform, so provide a deterministic stub: a no-op Picker with a static
 * Item, enough for rendering the time wheel in tests.
 */
jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = (props) => React.createElement('Picker', props, props.children);
  Picker.displayName = 'Picker';
  Picker.Item = (props) => React.createElement('Picker.Item', props);
  Picker.Item.displayName = 'Picker.Item';
  return {
    __esModule: true,
    default: Picker,
    Picker,
  };
});
