import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {DimensionValue, StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';

export type TimelineTone = 'idle' | 'active' | 'blocked';

export interface TimelineSegment {
  /** Day fraction 0..1. */
  start: number;
  /** Day fraction 0..1. */
  end: number;
  tone?: TimelineTone;
}

export interface TimelineBarProps {
  segments?: TimelineSegment[];
  height?: number;
  /** Current-time marker as a day fraction (0..1), or null to hide. */
  now?: number | null;
  style?: StyleProp<ViewStyle>;
}

const pct = (fraction: number): DimensionValue =>
  `${Math.round(Math.min(1, Math.max(0, fraction)) * 10000) / 100}%` as DimensionValue;

/** Diagonal hatch stripes for the elapsed portion (clipped by the track). */
const STRIPE_STEP = 7;
const STRIPE_WIDTH = 1.5;
/** Stripe layout until the first onLayout lands (~450pt of coverage). */
const STRIPE_COUNT = 64;
/** Shortest window that still renders as a visible sliver (points). */
const MIN_SEGMENT_WIDTH = 6;

/**
 * Horizontal day timeline. Time that already passed is tinted and hatched
 * with 45° diagonal hairlines ("spent"), the rest stays a quiet track,
 * blocked windows layer on top, and a "now" marker splits the two halves.
 */
export function TimelineBar({segments = [], height = 16, now = null, style}: TimelineBarProps) {
  const {colors} = useTheme();
  // Segment geometry runs on the measured track width; percentages stand
  // in for the single frame before the first onLayout arrives.
  const [trackWidth, setTrackWidth] = useState(0);

  const toneColor = (tone: TimelineTone): string =>
    tone === 'active' ? colors.textMuted : tone === 'blocked' ? colors.text : colors.track;

  /**
   * Both edges round onto the same pixel grid, so neighbouring windows
   * meet flush instead of leaving hairline gaps, and a window a few
   * minutes wide inflates to a visible sliver. Inflation may reach over
   * a neighbour — later segments paint on top, so stacking stays
   * deterministic — and nothing spills past either rounded cap.
   */
  const segmentBox = (
    segment: TimelineSegment,
  ): {left: DimensionValue; width: DimensionValue} | null => {
    const start = Math.min(1, Math.max(0, segment.start));
    const end = Math.min(1, Math.max(0, segment.end));
    if (end - start <= 0) {
      return null;
    }
    if (trackWidth <= 0) {
      return {left: pct(start), width: pct(end - start)};
    }
    let left = Math.round(start * trackWidth);
    let right = Math.round(end * trackWidth);
    if (right - left < MIN_SEGMENT_WIDTH) {
      right = Math.min(left + MIN_SEGMENT_WIDTH, trackWidth);
      // A sliver at the far cap grows leftward, not off the edge.
      left = Math.max(0, right - MIN_SEGMENT_WIDTH);
    }
    return {left, width: right - left};
  };

  const stripeCount = trackWidth > 0 ? Math.ceil(trackWidth / STRIPE_STEP) : STRIPE_COUNT;

  return (
    <View
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[
        styles.base,
        {height, borderRadius: height / 2, backgroundColor: colors.track},
        style,
      ]}>
      {now != null && now > 0 ? (
        // Square top/right/bottom edges on purpose: the hatch runs flush
        // into the "now" marker; only the track's own left cap is rounded.
        <View
          style={[
            styles.elapsed,
            {width: trackWidth > 0 ? Math.round(now * trackWidth) : pct(now)},
          ]}>
          <View style={[styles.elapsedTint, {backgroundColor: colors.text}]} />
          {Array.from({length: stripeCount}, (_, index) => index).map((index) => (
            <View
              key={index}
              style={[
                styles.stripe,
                {left: index * STRIPE_STEP, backgroundColor: colors.borderStrong},
              ]}
            />
          ))}
        </View>
      ) : null}
      {segments.map((segment, index) => {
        const box = segmentBox(segment);
        if (!box) {
          return null;
        }
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: box.left,
              width: box.width,
              backgroundColor: toneColor(segment.tone ?? 'idle'),
            }}
          />
        );
      })}
      {now != null ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            bottom: -3,
            // Keep the marker inside the track at the day edges.
            left:
              trackWidth > 0
                ? Math.min(Math.max(now * trackWidth, 1.5), trackWidth - 1.5)
                : pct(now),
            width: 3,
            marginLeft: -1.5,
            borderRadius: 1.5,
            backgroundColor: colors.text,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  elapsed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  elapsedTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  stripe: {
    position: 'absolute',
    top: '-60%',
    height: '220%',
    width: STRIPE_WIDTH,
    transform: [{rotate: '45deg'}],
  },
});
