import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius, spacing, typography, useTheme } from '../../ui';
import { haptic } from '../../lib/haptics';

export interface Option<T extends string> {
  value: T;
  label: string;
}

export interface OptionPickerProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessibility label of the group. */
  label?: string;
  hapticsEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Monochrome segmented picker (settings rows, stats period switch).
 * Selected segment fills with the accent (ink/paper) — "darker = active".
 */
export function OptionPicker<T extends string>({
  options,
  value,
  onChange,
  label,
  hapticsEnabled = true,
  style,
}: OptionPickerProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.base, { borderColor: colors.border }, style]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (selected) {
                return;
              }
              haptic('light', hapticsEnabled);
              onChange(option.value);
            }}
            style={[styles.segment, selected ? { backgroundColor: colors.text } : null]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentLabel,
                typography.caption,
                { color: selected ? colors.onAccent : colors.textMuted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control - spacing.xs / 2,
  },
  segmentLabel: {
    fontWeight: '600',
  },
});
