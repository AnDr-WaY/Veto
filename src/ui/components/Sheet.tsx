import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import type {ReactNode} from 'react';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {animate} from '../motion';
import {haptics} from '../haptics';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}

/** Offscreen offset for the panel (px). */
const OFFSCREEN = 480;

/**
 * Bottom sheet: scrim fade + panel slide, 300ms ease-out in, 250ms out —
 * transitions only, per the brand motion rule.
 */
export function Sheet({visible, onClose, title, children}: SheetProps) {
  const {colors, typography} = useTheme();
  const progress = useMemo(() => new Animated.Value(0), []);
  const [mounted, setMounted] = useState(visible);
  // Re-open support: flip `mounted` back on during render (adjusting state
  // when a prop changes) — SDK 57 react-hooks rules forbid sync setState in
  // effects, so the old effect-based reset is gone.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setMounted(true);
    }
  }
  // One soft tap per open: the ref re-arms on close so reopening hapticizes
  // again, while re-renders during the open animation stay silent.
  const openTapArmed = useRef(false);

  useEffect(() => {
    if (!visible) {
      openTapArmed.current = false;
      return;
    }
    if (openTapArmed.current) {
      return;
    }
    openTapArmed.current = true;
    haptics.tap();
  }, [visible]);

  useEffect(() => {
    if (visible) {
      animate(progress, 1, 'base').start();
      return;
    }
    if (!mounted) {
      return;
    }
    animate(progress, 0, 'fast').start(({finished}) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [visible, mounted, progress]);

  if (!mounted) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, {backgroundColor: colors.scrim, opacity: progress}]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {backgroundColor: colors.raised},
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [OFFSCREEN, 0],
                }),
              },
            ],
          },
        ]}>
        <View style={[styles.handle, {backgroundColor: colors.borderStrong}]} />
        {title ? (
          <Text style={[typography.title2, {color: colors.text}]}>{title}</Text>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
  },
});
