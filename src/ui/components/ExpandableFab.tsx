import React, {useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {radius, spacing} from '../tokens';
import {haptics} from '../haptics';
import {Glass} from './Glass';
import {Icon, type IconName} from './Icon';

export interface FabAction {
  icon: IconName;
  label: string;
  onPress: () => void;
}

export interface ExpandableFabProps {
  /** Accessibility label for the main (collapsed) button. */
  label: string;
  /** Accessibility label for the tap-outside-to-close target. */
  closeLabel: string;
  /** Revealed around the main button: first sits left, second sits right. */
  actions: [FabAction, FabAction];
  style?: StyleProp<ViewStyle>;
}

const SIZE = 56;
const GAP = 10;

/**
 * Center FAB: collapsed it is a 56pt glass circle; on tap the plus rotates
 * into a × and two glass pills detach FROM the button itself — each starts
 * with its center exactly on the × (measured natural width), tiny and
 * transparent, then grows and slides outward to its resting spot. The ×
 * never moves, no matter how long the labels are. Transform+opacity only
 * (native driver), so the text is never squeezed or re-wrapped. Collapses
 * before an action navigates away.
 */
export function ExpandableFab({label, closeLabel, actions, style}: ExpandableFabProps) {
  const {colors} = useTheme();
  const [open, setOpen] = useState(false);
  // Lazy state instead of useRef: the SDK 57 react-hooks/refs rule forbids
  // reading ref.current during render, and the interpolations read it.
  const [progress] = useState(() => new Animated.Value(0));
  // Natural pill widths — needed to start each pill centered on the ×.
  const [leftWidth, setLeftWidth] = useState(0);
  const [rightWidth, setRightWidth] = useState(0);

  const animate = (toValue: number) => {
    Animated.spring(progress, {
      toValue,
      friction: 8,
      tension: 60,
      useNativeDriver: true, // transform + opacity only
    }).start();
  };

  const toggle = () => {
    haptics.tick();
    const next = !open;
    setOpen(next);
    animate(next ? 1 : 0);
  };

  const runAction = (action: FabAction) => {
    haptics.tick();
    setOpen(false);
    animate(0);
    action.onPress();
  };

  const pill = (side: -1 | 1, width: number) => {
    // Distance from the pill's resting center back to the × center.
    const travel = SIZE / 2 + GAP + width / 2;
    return {
      opacity: progress,
      transform: [
        {translateX: progress.interpolate({inputRange: [0, 1], outputRange: [-side * travel, 0]})},
        {scale: progress.interpolate({inputRange: [0, 1], outputRange: [0.3, 1]})},
      ],
    };
  };

  const renderPill = (action: FabAction, side: -1 | 1, width: number) => (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[styles.actionPill, side < 0 ? styles.leftPill : styles.rightPill, pill(side, width)]}>
      <Glass style={styles.pillGlass} interactive>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onLayout={(event) => {
            const next = event.nativeEvent.layout.width;
            if (side < 0) {
              setLeftWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
            } else {
              setRightWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
            }
          }}
          onPress={() => runAction(action)}
          style={({pressed}) => [styles.actionInner, pressed && styles.pressed]}>
          <Icon name={action.icon} size={16} />
          <Text numberOfLines={1} style={[styles.actionLabel, {color: colors.text}]}>
            {action.label}
          </Text>
        </Pressable>
      </Glass>
    </Animated.View>
  );

  return (
    <>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={toggle}
          style={styles.backdrop}
        />
      ) : null}
      <View pointerEvents="box-none" style={[styles.wrap, style]}>
        {renderPill(actions[0], -1, leftWidth)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{expanded: open}}
          onPress={toggle}
          style={({pressed}) => [styles.main, pressed && styles.pressedMain]}>
          <Glass style={styles.glassCircle} interactive>
            <Animated.View style={{transform: [{rotate: rotate(progress)}]}}>
              <Icon name="plus" size={26} weight="medium" />
            </Animated.View>
          </Glass>
        </Pressable>
        {renderPill(actions[1], 1, rightWidth)}
      </View>
    </>
  );
}

/** Plus → × as the blob opens. */
function rotate(progress: Animated.AnimatedInterpolation<number>) {
  return progress.interpolate({inputRange: [0, 1], outputRange: ['0deg', '45deg']});
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxxl,
    alignItems: 'center',
  },
  main: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.full,
  },
  glassCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedMain: {
    opacity: 0.7,
  },
  actionPill: {
    position: 'absolute',
    bottom: 0,
    height: SIZE,
  },
  leftPill: {
    right: '50%',
    marginRight: SIZE / 2 + GAP,
  },
  rightPill: {
    left: '50%',
    marginLeft: SIZE / 2 + GAP,
  },
  pillGlass: {
    borderRadius: radius.full,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: SIZE,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  actionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
