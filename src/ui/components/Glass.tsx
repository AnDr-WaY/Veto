import React from 'react';
import {GlassView, isLiquidGlassAvailable} from 'expo-glass-effect';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';

const LIQUID = isLiquidGlassAvailable();

export interface GlassProps {
  style?: StyleProp<ViewStyle>;
  /** Interactive glass — adds the touch highlight (buttons inside). */
  interactive?: boolean;
  /** Optional tint over the glass effect. */
  tintColor?: string;
  children?: React.ReactNode;
}

/**
 * Liquid Glass surface (iOS 26+). Falls back to a raised card with a
 * hairline border on older iOS/other platforms, so floating chrome stays
 * readable everywhere. The material carries a STRONG theme-surface tint:
 * whatever the OS/glass adaptation does, blobs render light-on-light in
 * the light theme and dark-on-dark in the dark theme, so theme-tinted
 * content always contrasts.
 */
export function Glass({style, interactive = false, tintColor, children}: GlassProps) {
  const {colors} = useTheme();

  if (!LIQUID) {
    return (
      <View
        style={[
          styles.fallback,
          {backgroundColor: colors.raised, borderColor: colors.border},
          style,
        ]}>
        {children}
      </View>
    );
  }

  return (
    <GlassView
      glassEffectStyle="regular"
      isInteractive={interactive}
      tintColor={tintColor ?? colors.glassTint}
      style={[styles.glass, style]}>
      {children}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  glass: {},
  fallback: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
