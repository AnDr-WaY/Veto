import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';

/** Must stay aligned with src/core/contracts.ts strictness union. */
export type StrictnessMode = 'hard' | 'threshold';

export const STRICTNESS_ORDER: StrictnessMode[] = ['threshold', 'hard'];

export function strictnessLabel(mode: StrictnessMode): string {
  switch (mode) {
    case 'threshold':
      return 'Threshold';
    case 'hard':
      return 'Hard';
  }
}

export interface StrictnessCardProps {
  mode: StrictnessMode;
  title: string;
  description?: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Strictness picker card. Brand rule "the darker it gets, the stricter it
 * feels": threshold = quiet surface, hard = fully inverted (text-color
 * background).
 */
export function StrictnessCard({
  mode,
  title,
  description,
  selected = false,
  onPress,
  style,
}: StrictnessCardProps) {
  const {colors, typography} = useTheme();

  const inverted = mode === 'hard';
  const backgroundColor = mode === 'hard' ? colors.text : colors.surface;
  const foreground = inverted ? colors.bg : colors.text;
  const borderColor = selected ? colors.text : colors.border;
  const borderWidth = selected ? 2 : StyleSheet.hairlineWidth;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{checked: selected}}
      onPress={() => {
        haptics.tick();
        onPress?.();
      }}
      style={({pressed}) => [
        styles.base,
        {backgroundColor, borderColor, borderWidth},
        pressed && styles.pressed,
        style,
      ]}>
      <View style={styles.header}>
        <Text style={[typography.micro, styles.overline, {color: foreground}]}>
          {strictnessLabel(mode).toUpperCase()}
        </Text>
        <View
          style={[
            styles.check,
            selected
              ? {backgroundColor: inverted ? colors.bg : colors.text}
              : {
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: inverted ? colors.bg : colors.borderStrong,
                },
          ]}>
          {selected ? (
            <Text
              style={[styles.checkGlyph, {color: inverted ? colors.text : colors.onAccent}]}>
              ✓
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={[typography.title3, {color: foreground}]}>{title}</Text>
      {description ? (
        <Text style={[typography.callout, styles.overline, {color: foreground}]}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  overline: {
    opacity: 0.6,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.9,
  },
});
