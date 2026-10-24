import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {spacing} from '../tokens';
import {BlockChip} from './BlockChip';
import type {StrictnessMode} from './StrictnessCard';

export interface ShieldGlyphProps {
  /** Total glyph height in px (brand: 80pt on the shield screen). */
  size?: number;
  color: string;
}

/** Geometric shield built from pure Views (rounded body + border-trick tip). */
export function ShieldGlyph({size = 80, color}: ShieldGlyphProps) {
  const body = Math.round(size * 0.6);
  const tip = size - body;
  return (
    <View style={{width: size, height: size, alignItems: 'center'}} pointerEvents="none">
      <View
        style={{
          width: size,
          height: body,
          backgroundColor: color,
          borderTopLeftRadius: Math.round(size * 0.2),
          borderTopRightRadius: Math.round(size * 0.2),
        }}
      />
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderTopWidth: tip,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </View>
  );
}

export interface ShieldLayoutProps {
  /** Blocked app / selection name. */
  appName: string;
  /** Countdown or "until" label, rendered at the 80pt hero size. */
  untilLabel: string;
  strictness?: StrictnessMode;
  /** Chip text, e.g. "Hard block". Hidden when omitted. */
  strictnessLabel?: string;
  /** Optional one-line message under the app name. */
  message?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Reference layout of the shield screen: strictness chip, 80pt shield glyph,
 * hero countdown, app name, message. Fill with a bounded parent (Card or a
 * fixed-height View) when embedding in previews.
 */
export function ShieldLayout({
  appName,
  untilLabel,
  strictness = 'hard',
  strictnessLabel,
  message,
  style,
}: ShieldLayoutProps) {
  const {colors, typography} = useTheme();

  return (
    <View style={[styles.base, {backgroundColor: colors.bg}, style]}>
      {strictnessLabel ? <BlockChip label={strictnessLabel} tone="blocked" /> : null}
      <ShieldGlyph size={80} color={colors.text} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[typography.hero, {color: colors.text}]}>
        {untilLabel}
      </Text>
      <Text style={[typography.title3, {color: colors.text}]} numberOfLines={1}>
        {appName}
      </Text>
      {message ? (
        <Text style={[typography.callout, styles.message, {color: colors.textMuted}]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.xxxl,
  },
  message: {
    textAlign: 'center',
  },
});
