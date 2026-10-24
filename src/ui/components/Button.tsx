import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import type {ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  disabled?: boolean;
  /** Stretch to the parent width (default: hug content). */
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const {colors, typography} = useTheme();

  const padVertical = size === 'lg' ? spacing.xl : spacing.lg;
  const typeStyle = size === 'lg' ? typography.title3 : typography.callout;

  const variantStyle: ViewStyle =
    variant === 'primary'
      ? {backgroundColor: colors.accent}
      : variant === 'secondary'
        ? {
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderStrong,
          }
        : {backgroundColor: 'transparent'};

  const labelStyle = {
    color: disabled
      ? colors.textFaint
      : variant === 'primary'
        ? colors.onAccent
        : colors.text,
  };

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
      style={({pressed}) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variantStyle,
        {paddingVertical: padVertical, borderRadius: radius.control},
        disabled && styles.disabledContainer,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[typeStyle, labelStyle]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.72,
  },
  disabledContainer: {
    opacity: 0.5,
  },
});
