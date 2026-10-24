import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';

export interface RowProps {
  /** Leading content (label, icon). */
  left: React.ReactNode;
  /** Trailing content (value, chip, chevron). */
  right?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** List row: leading + trailing on one 56pt line. */
export function Row({left, right, onPress, style}: RowProps) {
  const {colors} = useTheme();

  const content = (
    <View
      style={[
        styles.base,
        {backgroundColor: colors.raised, borderColor: colors.border},
        style,
      ]}>
      <View style={styles.left}>{left}</View>
      {right != null ? <View style={styles.right}>{right}</View> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      style={({pressed}) => (pressed ? styles.pressed : null)}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  left: {
    flexShrink: 1,
  },
  right: {
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
});
