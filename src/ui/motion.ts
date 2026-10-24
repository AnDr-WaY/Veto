import {Animated, Easing} from 'react-native';
import {motion} from './tokens';
import type {MotionPreset} from './tokens';

/** Brand ease-out curve (cubic). */
export const easeOut = (): ((t: number) => number) => Easing.out(Easing.cubic);

/** Control points for Reanimated: `Easing.bezier(...motionBezier)`. */
export const motionBezier = motion.bezier;

/**
 * Animated.timing bound to the brand presets (250/300/350ms ease-out).
 * Native driver by default — transitions only, per the brand rule.
 */
export function animate(
  value: Animated.Value,
  toValue: number,
  preset: MotionPreset = 'base',
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue,
    duration: motion.duration[preset],
    easing: easeOut(),
    useNativeDriver: true,
  });
}
