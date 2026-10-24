import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {spacing} from '../tokens';
import {haptics} from '../haptics';
import {Icon} from './Icon';

export interface ScreenHeaderProps {
  /** Bar title; shown large below the bar when `large` is set. */
  title?: string;
  /** Renders the standard large back arrow on the left. */
  onBack?: () => void;
  backA11yLabel?: string;
  /** Right-aligned slot (IconButton, step dots, …). */
  right?: React.ReactNode;
  /** iOS-style large title under the bar (tab-level screens). */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BAR_HEIGHT = 44;

/**
 * The one true screen header: 44pt back arrow (never a tiny chevron),
 * centered title when navigating, large title for tab-level screens.
 */
export function ScreenHeader({
  title,
  onBack,
  backA11yLabel,
  right,
  large = false,
  style,
}: ScreenHeaderProps) {
  const {colors, typography} = useTheme();
  const showBarTitle = Boolean(title && !large);

  return (
    <View style={style}>
      <View style={styles.bar}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backA11yLabel ?? title ?? 'Back'}
            onPress={() => {
              haptics.tick();
              onBack();
            }}
            hitSlop={{top: 8, bottom: 8, left: 12, right: 12}}
            style={({pressed}) => [styles.back, pressed && styles.pressed]}>
            <Icon name="chevron.left" size={22} weight="bold" />
          </Pressable>
        ) : (
          <View style={styles.side} />
        )}
        {showBarTitle ? (
          <View style={[styles.titleSlot, !onBack && styles.titleSlotLeft]}>
            <Text
              numberOfLines={1}
              style={[typography.title3, styles.barTitle, {color: colors.text}]}>
              {title}
            </Text>
          </View>
        ) : (
          <View style={styles.titleSlot} />
        )}
        <View style={styles.sideRight}>{right}</View>
      </View>
      {large && title ? (
        <Text style={[typography.title1, styles.largeTitle, {color: colors.text}]}>{title}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    width: BAR_HEIGHT,
  },
  sideRight: {
    minWidth: BAR_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  back: {
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.55,
  },
  titleSlot: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  titleSlotLeft: {
    alignItems: 'flex-start',
  },
  barTitle: {
    fontWeight: '600',
  },
  largeTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
