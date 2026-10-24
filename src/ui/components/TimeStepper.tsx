import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';
import {Icon} from './Icon';

/** Compact "1h 30m" formatter used across the app. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  if (rest === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${rest}m`;
}

export interface TimeStepperProps {
  label?: string;
  /** Current value in minutes. */
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (minutes: number) => string;
  style?: StyleProp<ViewStyle>;
}

/** − / value / + stepper clamped to [min, max], tick haptic on change. */
export function TimeStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 480,
  step = 15,
  format = formatMinutes,
  style,
}: TimeStepperProps) {
  const {colors, typography} = useTheme();

  const atMin = value <= min;
  const atMax = value >= max;

  const bump = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) {
      return;
    }
    haptics.tick();
    onChange(next);
  };

  return (
    <View
      style={[
        styles.base,
        {backgroundColor: colors.raised, borderColor: colors.border},
        style,
      ]}>
      {label ? (
        <Text style={[typography.callout, {color: colors.textMuted}]}>{label}</Text>
      ) : null}
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ? `Decrease ${label}` : 'Decrease'}
          accessibilityState={{disabled: atMin}}
          disabled={atMin}
          onPress={() => bump(-step)}
          style={({pressed}) => [
            styles.chevron,
            {backgroundColor: colors.surface, borderColor: colors.border},
            pressed && styles.pressed,
          ]}>
          <Icon name="minus" size={18} color={atMin ? colors.textFaint : colors.text} />
        </Pressable>
        <Text
          accessibilityLabel={label ?? 'Value'}
          style={[typography.title3, styles.value, {color: colors.text}]}>
          {format(value)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ? `Increase ${label}` : 'Increase'}
          accessibilityState={{disabled: atMax}}
          disabled={atMax}
          onPress={() => bump(step)}
          style={({pressed}) => [
            styles.chevron,
            {backgroundColor: colors.surface, borderColor: colors.border},
            pressed && styles.pressed,
          ]}>
          <Icon name="plus" size={18} color={atMax ? colors.textFaint : colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  chevron: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 88,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.72,
  },
});
