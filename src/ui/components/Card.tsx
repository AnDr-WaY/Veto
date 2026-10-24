import React from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';

export interface CardProps {
  children?: React.ReactNode;
  /** Horizontal/vertical padding via the 4pt grid (default on). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Raised surface container: 16pt radius, hairline border. */
export function Card({children, padded = true, style}: CardProps) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.raised,
          borderColor: colors.border,
          padding: padded ? spacing.xl : undefined,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
