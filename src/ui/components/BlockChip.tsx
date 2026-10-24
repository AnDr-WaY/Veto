import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';

export type BlockChipTone = 'idle' | 'active' | 'blocked';

export interface BlockChipProps {
  label: string;
  /** idle = quiet, active = running rule, blocked = filled (strictest). */
  tone?: BlockChipTone;
  onPress?: () => void;
}

/** Status pill with a state dot; "blocked" fills with the highest-contrast color. */
export function BlockChip({label, tone = 'idle', onPress}: BlockChipProps) {
  const {colors} = useTheme();

  const filled = tone === 'blocked';
  const dotColor =
    tone === 'idle' ? colors.textFaint : tone === 'active' ? colors.textMuted : colors.onAccent;

  const body = (
    <View
      style={[
        styles.base,
        filled
          ? {backgroundColor: colors.text}
          : {
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            },
      ]}>
      <View style={[styles.dot, {backgroundColor: dotColor}]} />
      <Text
        numberOfLines={1}
        style={[styles.label, {color: filled ? colors.onAccent : colors.text}]}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return body;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      style={({pressed}) => (pressed ? styles.pressed : null)}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
