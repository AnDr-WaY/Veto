import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';
import {Icon} from './Icon';

export interface FABProps {
  /** Accessibility label (required — the icon alone is not accessible). */
  label: string;
  onPress?: () => void;
}

const SIZE = 56;

/** Floating action button: accent circle, full radius, light tap haptic. */
export function FAB({label, onPress}: FABProps) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({pressed}) => [
        styles.base,
        {backgroundColor: colors.accent},
        pressed && styles.pressed,
      ]}>
      <Icon name="plus" size={26} weight="medium" color={colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    right: spacing.xxl,
    bottom: spacing.xxxl,
    width: SIZE,
    height: SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
    transform: [{scale: 0.96}],
  },
});
