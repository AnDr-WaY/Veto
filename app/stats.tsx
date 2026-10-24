import React, { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, EmptyState, Glass, IconButton, spacing, typography, useTheme } from '@/ui';
import { strings as coreStrings } from '@/core/strings';
import { statsStrings } from '@/features/stats';
import { OptionPicker } from '@/features/settings';
import { formatDuration } from '@/lib/time';
import { useStatsSummary, type StatsPeriod } from '@/store';

const PERIOD_OPTIONS: readonly { value: StatsPeriod; label: string }[] = [
  { value: 'today', label: statsStrings.period.today },
  { value: 'last7', label: statsStrings.period.last7 },
  { value: 'last30', label: statsStrings.period.last30 },
];

/** E5 Stats: protected time, attempts and streak — live store data. */
export default function StatsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { summary, loading, period, setPeriod, refresh } = useStatsSummary();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const isEmpty = !loading && summary.protectedMinutes === 0 && summary.attempts === 0;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      bounces={false}
      alwaysBounceHorizontal={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Glass style={styles.backBubble} interactive>
          <IconButton icon="chevron.left" label={coreStrings.common.back} onPress={() => router.back()} />
        </Glass>
        <Text style={[typography.title2, styles.headerTitle, { color: colors.text }]}>
          {statsStrings.title}
        </Text>
      </View>

      <OptionPicker
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(next) => void setPeriod(next)}
        label={statsStrings.title}
        style={styles.period}
      />

      {loading && summary.protectedMinutes === 0 && summary.attempts === 0 ? (
        <ActivityIndicator style={styles.loader} color={colors.text} />
      ) : isEmpty ? (
        <EmptyState
          title={statsStrings.emptyTitle}
          message={statsStrings.emptyMessage}
          style={styles.empty}
        />
      ) : (
        <>
          <Card style={styles.hero}>
            <Text style={[typography.micro, { color: colors.textMuted }]}>
              {statsStrings.protectedTime}
            </Text>
            <Text style={[typography.display, styles.heroValue, { color: colors.text }]}>
              {formatDuration(Math.max(0, Math.round(summary.protectedMinutes)))}
            </Text>
          </Card>

          <View style={styles.grid}>
            <Card style={styles.cell}>
              <Text style={[typography.title2, { color: colors.text }]}>{summary.attempts}</Text>
              <Text style={[typography.caption, styles.cellLabel, { color: colors.textMuted }]}>
                {statsStrings.attempts}
              </Text>
            </Card>
            <Card style={styles.cell}>
              <Text style={[typography.title2, { color: colors.text }]}>{summary.streakDays}</Text>
              <Text style={[typography.caption, styles.cellLabel, { color: colors.textMuted }]}>
                {statsStrings.streak}
              </Text>
            </Card>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  backBubble: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontWeight: '600',
  },
  period: {
    marginTop: spacing.sm,
  },
  loader: {
    marginTop: spacing.huge,
  },
  empty: {
    marginTop: spacing.xxxl,
  },
  hero: {
    gap: spacing.xs,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  heroValue: {
    marginTop: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  cellLabel: {
    textAlign: 'center',
  },
});
