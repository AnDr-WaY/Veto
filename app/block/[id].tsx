/**
 * E4 — Block detail: apps, schedule, strictness, header Edit,
 * "Pause today" / Resume and Delete. One transition from Home.
 */

import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlockChip, Button, Card, EmptyState, ScreenHeader, useTheme } from '@/ui';
import { strings as coreStrings } from '@/core/strings';
import { haptic } from '@/lib/haptics';
import type { BlockRule } from '@/core/contracts';
import { useRuleActions, useRules } from '@/features/rules/hooks';
import {
  formatRangeWithDuration,
  formatRuleDays,
  formatSelectionDetail,
  nowMinutesLocal,
  ruleState,
  strictnessDetail,
  strictnessTitle,
} from '@/features/rules/viewModel';
import { rulesStrings } from '@/features/rules/strings';

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[typography.caption, styles.lineLabel, { color: colors.textFaint }]}>
        {label}
      </Text>
      <Text style={[typography.body, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function RuleDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { rules, loading } = useRules();
  const actions = useRuleActions();

  const rule = useMemo<BlockRule | null>(
    () => rules.find((candidate) => candidate.id === id) ?? null,
    [rules, id],
  );

  const nowMin = nowMinutesLocal();
  const weekday = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  if (!loading && !rule) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <EmptyState
          title={rulesStrings.detail.notFoundTitle}
          message={rulesStrings.detail.notFoundMessage}
          action={
            <Button
              label={coreStrings.common.close}
              variant="secondary"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  if (!rule) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={[typography.callout, { color: colors.textFaint }]}>
          {coreStrings.common.loading}
        </Text>
      </View>
    );
  }

  const state = ruleState(rule, nowMin, weekday);

  const openEdit = () => {
    haptic('light');
    // Quick (one-shot) blocks edit through the quick wizard, recurring ones
    // through the schedule wizard — the create flow prefills and saves over.
    const path = rule.oneShot ? '/create-block' : '/create-schedule';
    router.push(`${path}?edit=${encodeURIComponent(rule.id)}`);
  };

  const togglePauseToday = () => {
    haptic('light');
    actions
      .update(rule.id, { paused: !rule.paused })
      .then(() => haptic(rule.paused ? 'success' : 'warning'))
      .catch(() => haptic('error'));
  };

  const confirmDelete = () => {
    Alert.alert(rulesStrings.detail.deleteTitle, rulesStrings.detail.deleteMessage, [
      { text: rulesStrings.detail.deleteCancel, style: 'cancel' },
      {
        text: rulesStrings.detail.deleteConfirm,
        style: 'destructive',
        onPress: () => {
          haptic('warning');
          actions
            .remove(rule.id)
            .catch(() => haptic('error'))
            .finally(() => router.back());
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        alwaysBounceHorizontal={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: spacing.xxl,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.huge,
          },
        ]}
      >
        <ScreenHeader
          onBack={() => router.back()}
          backA11yLabel={coreStrings.common.back}
          title={rulesStrings.detail.title}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={rulesStrings.detail.edit}
              onPress={openEdit}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}
            >
              <Text style={[typography.callout, { color: colors.text }]}>
                {rulesStrings.detail.edit}
              </Text>
            </Pressable>
          }
        />

        <View style={styles.titleRow}>
          <Text style={[typography.title1, styles.title, { color: colors.text }]}>
            {rule.title}
          </Text>
          <BlockChip
            label={
              state === 'paused'
                ? rulesStrings.state.paused
                : state === 'active'
                  ? rulesStrings.state.active
                  : rulesStrings.state.upcoming
            }
            tone={state === 'active' ? 'blocked' : state === 'paused' ? 'idle' : 'active'}
          />
        </View>

        <Card>
          <DetailLine
            label={rulesStrings.detail.appsCard}
            value={formatSelectionDetail(rule)}
          />
          <DetailLine
            label={rulesStrings.detail.scheduleCard}
            value={`${formatRuleDays(rule)} · ${formatRangeWithDuration(rule.startMin, rule.endMin)}`}
          />
          <DetailLine
            label={rulesStrings.detail.strictnessCard}
            value={`${strictnessTitle(rule.strictness)} · ${strictnessDetail(rule)}`}
          />
        </Card>

        {rule.paused ? (
          <Text style={[typography.caption, { color: colors.textFaint }]}>
            {rulesStrings.detail.pauseTodayCaption}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={rule.paused ? rulesStrings.detail.resume : rulesStrings.detail.pauseToday}
            variant={rule.paused ? 'secondary' : 'primary'}
            onPress={togglePauseToday}
            fullWidth
          />
          <Button
            label={rulesStrings.detail.delete}
            variant="ghost"
            onPress={confirmDelete}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flexShrink: 1,
  },
  line: {
    gap: 2,
    marginBottom: 10,
  },
  lineLabel: {
    textTransform: 'uppercase',
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionPressed: {
    opacity: 0.55,
  },
  actions: {
    gap: 8,
    marginTop: 8,
  },
});
