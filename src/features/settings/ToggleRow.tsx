import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { spacing, typography, useTheme, Row } from '../../ui';
import { haptic } from '../../lib/haptics';

export interface ToggleRowProps {
  label: string;
  caption?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  hapticsEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

/** Settings row with a monochrome switch (notifications, haptics). */
export function ToggleRow({
  label,
  caption,
  value,
  onChange,
  hapticsEnabled = true,
  style,
  labelStyle,
}: ToggleRowProps) {
  const { colors } = useTheme();

  return (
    <Row
      style={style}
      left={
        <View style={styles.labels}>
          <Text style={[typography.body, { color: colors.text }, labelStyle]}>{label}</Text>
          {caption ? (
            <Text style={[typography.caption, { color: colors.textMuted }]}>{caption}</Text>
          ) : null}
        </View>
      }
      right={
        <Switch
          value={value}
          onValueChange={(next) => {
            haptic('light', hapticsEnabled);
            onChange(next);
          }}
          trackColor={{ false: colors.track, true: colors.text }}
          thumbColor={colors.onAccent}
          ios_backgroundColor={colors.track}
          accessibilityLabel={label}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  labels: {
    gap: spacing.xs,
  },
});
