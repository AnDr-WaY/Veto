import React, { useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, useTheme } from '../../ui';
import { haptic } from '../../lib/haptics';

export interface HoldToConfirmProps {
  label: string;
  /** Hint under the button ("Hold to confirm"). */
  hint?: string;
  /** Hold duration in ms (default 1200). */
  holdMs?: number;
  disabled?: boolean;
  hapticsEnabled?: boolean;
  onConfirm: () => void;
}

/**
 * Friction confirmation: the action fires only after holding the button for
 * `holdMs` while a fill bar sweeps across it. Releasing early cancels.
 * Used for the global pause (E6) — a destructive-ish action that must not
 * fire on a tap.
 */
export function HoldToConfirm({
  label,
  hint,
  holdMs = 1200,
  disabled = false,
  hapticsEnabled = true,
  onConfirm,
}: HoldToConfirmProps) {
  const { colors } = useTheme();
  const progress = useMemo(() => new Animated.Value(0), []);
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  const reset = (animated: boolean) => {
    animation.current?.stop();
    animation.current = null;
    if (animated) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    } else {
      progress.setValue(0);
    }
  };

  const startHold = () => {
    if (disabled) {
      return;
    }
    animation.current?.stop();
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.current.start(({ finished }) => {
      if (!finished) {
        return;
      }
      animation.current = null;
      haptic('success', hapticsEnabled);
      onConfirm();
      progress.setValue(0);
    });
  };

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint ?? 'Press and hold to confirm'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={startHold}
        onPressOut={() => reset(true)}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.accent,
            opacity: disabled ? 0.4 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <Animated.View
          style={[styles.fill, { width: fillWidth, backgroundColor: colors.onAccent }]}
        />
        <Text numberOfLines={1} style={[typography.title3, { color: colors.onAccent }]}>
          {label}
        </Text>
      </Pressable>
      {hint ? (
        <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0.18,
  },
  hint: {
    textAlign: 'center',
  },
});
