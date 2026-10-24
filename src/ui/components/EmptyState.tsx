import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useTheme} from '../Theme';
import {spacing} from '../tokens';
import {Icon, type IconName} from './Icon';

export interface EmptyStateProps {
  /** Optional SF Symbol above the title (decorative, kept quiet). */
  icon?: IconName;
  title: string;
  message?: string;
  /** Optional CTA slot (pass a Button). */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Minimal empty state: quiet icon, muted one-liners, optional action.
 * Deliberately understated — the empty canvas should whisper, not shout.
 */
export function EmptyState({icon, title, message, action, style}: EmptyStateProps) {
  const {colors, typography} = useTheme();

  return (
    <View style={[styles.base, style]}>
      {icon ? <Icon name={icon} size={28} weight="medium" color={colors.textFaint} /> : null}
      <Text style={[typography.callout, styles.title, {color: colors.textMuted}]}>{title}</Text>
      {message ? (
        <Text style={[typography.caption, styles.message, {color: colors.textFaint}]}>
          {message}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  title: {
    fontWeight: '600',
  },
  message: {
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    paddingTop: spacing.md,
  },
});
