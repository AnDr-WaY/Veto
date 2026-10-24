import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius} from '../tokens';

export interface DayDialProps {
  /** Center time, e.g. "14:00" (rendered at the 64pt display size). */
  timeLabel: string;
  /** One-line context under the time. */
  caption?: string;
  /** Highlighted hours of day, 0–23 (e.g. blocked range). */
  hours?: number[];
  /** Current hour 0–23 for the bold marker, or null to hide. */
  nowHour?: number | null;
  /** Outer diameter in px. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const HOUR_COUNT = 24;

/**
 * Day dial: 24 hour ticks around a circle, highlighted hours in the highest
 * contrast color, bold "now" marker, big time in the center.
 * Pure Views — no SVG dependency.
 */
export function DayDial({
  timeLabel,
  caption,
  hours = [],
  nowHour = null,
  size = 280,
  style,
}: DayDialProps) {
  const {colors, typography} = useTheme();
  const highlighted = new Set(hours);

  return (
    <View
      style={[
        styles.base,
        {width: size, height: size, borderRadius: radius.full, borderColor: colors.border},
        style,
      ]}>
      {Array.from({length: HOUR_COUNT}, (_, hour) => {
        const isNow = nowHour === hour;
        return (
          <View
            key={hour}
            pointerEvents="none"
            style={[
              styles.hourRing,
              {width: size, height: size},
              {transform: [{rotate: `${hour * (360 / HOUR_COUNT)}deg`}]},
            ]}>
            <View
              style={[
                styles.hourTick,
                isNow
                  ? {width: 6, height: 26, top: 8, borderRadius: 3, backgroundColor: colors.text}
                  : highlighted.has(hour)
                    ? {backgroundColor: colors.text}
                    : {backgroundColor: colors.border},
              ]}
            />
          </View>
        );
      })}
      <View style={styles.center} pointerEvents="none">
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[typography.display, {color: colors.text}]}>
          {timeLabel}
        </Text>
        {caption ? (
          <Text style={[typography.caption, {color: colors.textMuted}]}>{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  hourRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
  },
  hourTick: {
    position: 'absolute',
    top: 10,
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  center: {
    alignItems: 'center',
  },
});
