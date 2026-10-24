/**
 * FamilyActivityPicker wrapper.
 *
 * The persisted sheet view stores the encoded FamilyActivitySelection into the
 * App Group registry under `selectionRef` (the id contracts use), and reports
 * token counts back — the native event carries application/category/webDomain
 * counts; `selectionCount` per contract counts apps + web domains.
 *
 * Feature screens (Ч4) render this inside their rule editor; the engine only
 * requires that `selectionRef` has a registry entry before `apply()` runs.
 *
 * Expo Go has no native sheet view (and no Family Controls): the component
 * renders a neutral placeholder there, and the SwiftUI view is loaded through
 * a guarded require — a static import would throw before the Go check runs.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { ActivitySelectionMetadata } from 'react-native-device-activity';

import { isExpoGo } from '../../core/environment';
import { useTheme } from '@/ui';

/** Contract's selectionCount: applications + web domains in the selection. */
export function selectionCountFromMetadata(meta: ActivitySelectionMetadata): number {
  return meta.applicationCount + meta.webDomainCount;
}

export interface SelectionPickerProps {
  /** Registry id the selection is stored under (= BlockRule.selectionRef). */
  selectionRef: string;
  /** Called with apps+domains count whenever the user edits the selection. */
  onSelectionCount: (count: number) => void;
  /** Called on Cancel/Done in the native navigation bar. */
  onDismissRequest?: () => void;
  headerText?: string | null;
  footerText?: string | null;
}

export function SelectionPicker({
  selectionRef,
  onSelectionCount,
  onDismissRequest,
  headerText,
  footerText,
}: SelectionPickerProps) {
  const { colors, typography } = useTheme();

  if (isExpoGo()) {
    return (
      <View
        style={[
          styles.placeholder,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[typography.callout, { color: colors.textMuted }]}>
          Picking real apps needs the iOS dev-client build (Screen Time
          permissions). The Expo Go prototype uses the demo catalog instead.
        </Text>
      </View>
    );
  }

  // Native dev-client build: guarded require keeps the SwiftUI binding out of
  // the import graph (it throws at import time under Expo Go).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DeviceActivitySelectionSheetViewPersisted } = require('react-native-device-activity') as typeof import('react-native-device-activity');

  return (
    <DeviceActivitySelectionSheetViewPersisted
      familyActivitySelectionId={selectionRef}
      onSelectionChange={(event) => {
        onSelectionCount(selectionCountFromMetadata(event.nativeEvent));
      }}
      onDismissRequest={onDismissRequest ? () => onDismissRequest() : undefined}
      headerText={headerText ?? null}
      footerText={footerText ?? null}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
    justifyContent: 'center',
  },
});
