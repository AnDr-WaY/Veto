/**
 * E1 — Home (the app's index route, so `/` matches on cold start —
 * without an index file expo-router shows the "Unmatched route" screen):
 * big clock + glass header actions, thick day bar with the time-left
 * widget row, then the full list of created blocks. The top section is
 * fixed — only the block list scrolls, and only when it overflows. The
 * center ExpandableFab springs into instant / scheduled creation. All
 * data flows through useRules() — no direct store access.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EmptyState,
  ExpandableFab,
  Glass,
  IconButton,
  TimelineBar,
  spacing,
  useTheme,
} from '@/ui';
import type { BlockRule } from '@/core/contracts';
import { weekdayIndex } from '@/lib/date';
import { minutesToHHMM } from '@/lib/time';
import { haptic } from '@/lib/haptics';
import { useRules } from '@/features/rules/hooks';
import { useRulesStore } from '@/store';
import {
  formatCountdown,
  isOneShotExpired,
  nextBlocks,
  nowMinutesLocal,
} from '@/features/rules/viewModel';
import { rulesStrings } from '@/features/rules/strings';
import { strings } from '@/core/strings';
import { BlockCard } from '@/features/rules/components/BlockCard';

function useClock(): { minutes: number; now: Date } {
  // The clock lives in state so render output stays pure (SDK 57
  // react-hooks rules forbid Date.now() during render); the interval is
  // the only place that reads the wall clock after mount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return { minutes: nowMinutesLocal(now), now };
}

export default function TodayScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { rules, loading, refresh } = useRules();
  const { minutes: nowMin, now } = useClock();

  const weekday = weekdayIndex(now.getTime()) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const { active, upcoming } = useMemo(
    () => nextBlocks(rules, nowMin, weekday),
    [rules, nowMin, weekday],
  );
  // Quick blocks vanish once their window has passed.
  const liveRules = useMemo(() => rules.filter((rule) => !isOneShotExpired(rule, now)), [rules, now]);
  const pausedCount = rules.filter((rule) => rule.paused).length;
  const leftToday = formatCountdown(Math.max(0, 24 * 60 - nowMin));

  useFocusEffect(
    useCallback(() => {
      // Returning from the wizard / detail: re-read the store for fresh data.
      void refresh();
    }, [refresh]),
  );

  const discard = useRulesStore((state) => state.discard);

  useEffect(() => {
    // Delete expired one-shot blocks from STORAGE ONLY — the engine disarms
    // completed one-shots on re-arm by itself. Never call the full remove()
    // here: its native teardown (unblockSelection) on a launch dispatch
    // queue aborts the app (the build-18/19 crash class).
    for (const rule of rules) {
      if (isOneShotExpired(rule, now)) {
        void discard(rule.id).catch(() => undefined);
      }
    }
  }, [rules, discard, nowMin, now]);

  const openCreate = () => router.push('/create-block');
  const openScheduled = () => router.push('/create-schedule');
  const openStats = () => router.push('/stats');
  const openSettings = () => router.push('/settings');
  const openDetail = (rule: BlockRule) => {
    haptic('light');
    router.push(`/block/${rule.id}`);
  };

  const showEmpty = !loading && liveRules.length === 0;
  const showNothingActive =
    liveRules.length > 0 && active.length === 0 && upcoming.length === 0;

  return (
    // Explicit themed background: the native screen layer underneath is
    // white by default and would otherwise stay white in the dark theme.
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View
        style={[styles.top, { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xxl }]}
      >
        <Text style={[typography.display, styles.clock, { color: colors.text }]}>
          {minutesToHHMM(nowMin)}
        </Text>
        <Glass style={styles.headerPill} interactive>
          <IconButton icon="chart.bar" label={strings.tabs.stats} onPress={openStats} />
          <IconButton icon="gearshape" label={strings.tabs.settings} onPress={openSettings} />
        </Glass>
      </View>

      <View style={[styles.daySection, { paddingHorizontal: spacing.xxl }]}>
        <TimelineBar now={nowMin / (24 * 60)} height={20} />
        <Text style={[typography.caption, styles.leftToday, { color: colors.textMuted }]}>
          {rulesStrings.home.leftToday(leftToday)}
        </Text>
      </View>

      <View style={[styles.sectionRow, { paddingHorizontal: spacing.xxl }]}>
        <Text style={[typography.micro, { color: colors.textFaint }]}>
          {rulesStrings.home.blocksSection.toUpperCase()}
        </Text>
        {pausedCount > 0 ? (
          <Text style={[typography.caption, { color: colors.textFaint }]}>
            {rulesStrings.home.pausedNote}
          </Text>
        ) : null}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: spacing.xxl, paddingBottom: insets.bottom + 140 },
        ]}
        bounces={false}
      alwaysBounceHorizontal={false}
        showsVerticalScrollIndicator={false}
      >
        {showEmpty ? (
          <EmptyState
            title={rulesStrings.empty.title}
            message={rulesStrings.empty.message}
          />
        ) : (
          <>
            {showNothingActive ? (
              <Text style={[typography.callout, styles.nothing, { color: colors.textFaint }]}>
                {rulesStrings.home.nothingActive}
              </Text>
            ) : null}
            <View style={styles.blockList}>
              {liveRules.map((rule) => (
                <Pressable key={rule.id} onPress={() => openDetail(rule)}>
                  <BlockCard rule={rule} nowMin={nowMin} weekday={weekday} />
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <ExpandableFab
        label={rulesStrings.rules.a11yAdd}
        closeLabel={strings.common.close}
        actions={[
          { icon: 'bolt', label: rulesStrings.create.titleQuick, onPress: openCreate },
          { icon: 'calendar', label: rulesStrings.create.titleSchedule, onPress: openScheduled },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clock: {
    marginTop: spacing.md,
  },
  headerPill: {
    borderRadius: 999,
    flexDirection: 'row',
  },
  daySection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  leftToday: {
    marginTop: spacing.xs,
  },
  sectionRow: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
  },
  nothing: {
    marginTop: spacing.xs,
  },
  blockList: {
    gap: spacing.sm,
  },
});
