import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {radius} from '../tokens';
import {haptics} from '../haptics';
import {Icon, type IconName} from './Icon';

export interface IconButtonProps {
  /** SF Symbol name (type-safe). Always pair with a label. */
  icon: IconName;
  /** Accessibility label (required — the icon alone is not accessible). */
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE = 44;

/** 44×44 circular header action — the one true icon button. */
export function IconButton({icon, label, onPress, disabled = false, style}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={() => {
        haptics.tick();
        onPress?.();
      }}
      style={({pressed}) => [styles.base, style, pressed && !disabled && styles.pressed]}>
      <Icon name={icon} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.55,
  },
});
