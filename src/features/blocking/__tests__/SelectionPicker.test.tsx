import { act, create } from 'react-test-renderer';
import type { ActivitySelectionMetadata } from 'react-native-device-activity';

// Registered before the component module is loaded (require below), because
// babel-jest hoisting is not applied to this .tsx transform pipeline.
jest.mock('react-native-device-activity', () => ({
  DeviceActivitySelectionSheetViewPersisted: jest.fn(() => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SelectionPicker, selectionCountFromMetadata } = require('../SelectionPicker') as typeof import('../SelectionPicker');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DeviceActivitySelectionSheetViewPersisted } = require('react-native-device-activity') as {
  DeviceActivitySelectionSheetViewPersisted: jest.Mock;
};

describe('selectionCountFromMetadata', () => {
  it('counts applications + web domains (contract selectionCount)', () => {
    const meta: ActivitySelectionMetadata = {
      applicationCount: 3,
      categoryCount: 1,
      webDomainCount: 2,
      includeEntireCategory: false,
    };
    expect(selectionCountFromMetadata(meta)).toBe(5);
  });
});

describe('SelectionPicker', () => {
  it('passes selectionRef through and reports apps+domains on changes', () => {
    const onSelectionCount = jest.fn();
    const onDismissRequest = jest.fn();

    // React 19 flushes the render only inside act().
    act(() => {
      create(
        <SelectionPicker
          selectionRef="sel_r1"
          onSelectionCount={onSelectionCount}
          onDismissRequest={onDismissRequest}
          headerText="Pick apps"
        />,
      );
    });

    expect(DeviceActivitySelectionSheetViewPersisted).toHaveBeenCalled();
    const props = DeviceActivitySelectionSheetViewPersisted.mock.calls[0][0] as {
      familyActivitySelectionId: string;
      onSelectionChange: (event: { nativeEvent: ActivitySelectionMetadata }) => void;
      onDismissRequest?: () => void;
      headerText: string | null;
    };
    expect(props.familyActivitySelectionId).toBe('sel_r1');
    expect(props.headerText).toBe('Pick apps');

    // Simulate the native selection change: wrapper reports apps+domains.
    act(() => {
      props.onSelectionChange({
        nativeEvent: {
          applicationCount: 2,
          categoryCount: 0,
          webDomainCount: 1,
          includeEntireCategory: false,
        },
      });
    });
    expect(onSelectionCount).toHaveBeenCalledWith(3);

    // Dismissal is forwarded without the native event payload.
    act(() => {
      props.onDismissRequest?.();
    });
    expect(onDismissRequest).toHaveBeenCalledTimes(1);
  });
});
