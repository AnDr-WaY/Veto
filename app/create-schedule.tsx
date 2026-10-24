/**
 * Schedule creation — the recurring path, two screens:
 * (1) which apps, (2) when — days of the week (ordered the way the user's
 * locale lays out a calendar), start/end time and soft/hard, all on one
 * scrollable screen. A schedule is always recurring: there is no "from now"
 * and no one-shot.
 *
 * The same wizard edits an existing schedule: pushed with `?edit=<id>` from
 * the detail screen, prefilled from the rule and saved over it.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, ScreenHeader, TimePickerWheel, useTheme } from '@/ui';
import { haptic } from '@/lib/haptics';
import { MINUTES_PER_DAY, MINUTES_STEP } from '@/core/contracts';
import type { BlockRule, DaysOfWeek, RuleDays } from '@/core/contracts';
import { strings as coreStrings } from '@/core/strings';
import { useRuleActions, useRules } from '@/features/rules/hooks';
import {
  blockRuleToScheduleDraft,
  defaultScheduleDraft,
  firstWeekdayIndex,
  formatDays,
  formatRangeWithDuration,
  orderedWeekdays,
  scheduleDraftProblems,
  scheduleDraftToNewBlockRule,
  type ScheduleDraft,
  type ScheduleDraftProblem,
} from '@/features/rules/viewModel';
import { rulesStrings } from '@/features/rules/strings';
import { AppPicker } from '@/features/rules/components/AppPicker';

const TOTAL_STEPS = 2;

const PROBLEM_COPY: Record<ScheduleDraftProblem, string> = {
  selectionEmpty: rulesStrings.create.problemSelection,
  daysEmpty: rulesStrings.create.problemDays,
  rangeInvalid: rulesStrings.create.problemRange,
};

/** All seven days collapse to the contract's "daily". */
function daysRule(days: DaysOfWeek[]): RuleDays {
  const sorted = [...days].sort((a, b) => a - b) as DaysOfWeek[];
  return sorted.length === 7 ? 'daily' : sorted;
}

export default function CreateScheduleScreen() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof params.edit === 'string' ? params.edit : '';

  if (editId.length === 0) {
    return <ScheduleWizard editRule={null} />;
  }
  return <EditRuleGate editId={editId} />;
}

/**
 * Resolves the rule to edit from the data seam. The wizard mounts only once
 * the rule is known, so its draft state can initialize prefilled — no
 * hydration effects. `key` keeps identity stable across live refreshes.
 */
function EditRuleGate({ editId }: { editId: string }) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { rules, loading } = useRules();

  const editRule = rules.find((candidate) => candidate.id === editId) ?? null;

  if (editRule) {
    return <ScheduleWizard key={editRule.id} editRule={editRule} />;
  }
  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={[typography.callout, { color: colors.textFaint }]}>
          {coreStrings.common.loading}
        </Text>
      </View>
    );
  }
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

function ScheduleWizard({ editRule }: { editRule: BlockRule | null }) {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useRuleActions();
  const editing = editRule !== null;

  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    editing ? blockRuleToScheduleDraft(editRule) : defaultScheduleDraft(),
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // Same contract as create-block: a failed save is never silent.
  const [saveFailed, setSaveFailed] = useState(false);

  // The week row follows the locale's calendar convention (Monday-first in
  // most of the world, Sunday-first in the US and friends), frozen per mount.
  const weekOrder = useMemo(() => orderedWeekdays(firstWeekdayIndex()), []);

  const problems = useMemo(() => scheduleDraftProblems(draft), [draft]);

  const patch = (next: Partial<ScheduleDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const stepProblems = (index: number): ScheduleDraftProblem[] => {
    if (index === 0) {
      return problems.filter((problem) => problem === 'selectionEmpty');
    }
    return problems;
  };

  const toggleDay = (day: DaysOfWeek) => {
    const days = draft.days.includes(day)
      ? draft.days.filter((candidate) => candidate !== day)
      : [...draft.days, day];
    haptic('light');
    patch({ days });
  };

  const submit = async () => {
    if (problems.length > 0 || busy) {
      return;
    }
    setBusy(true);
    setSaveFailed(false);
    try {
      haptic('success');
      if (editRule) {
        // Edit: saved over the existing rule — id, pause state and the
        // creation timestamp stay untouched.
        await actions.update(editRule.id, scheduleDraftToNewBlockRule(draft));
      } else {
        await actions.create(scheduleDraftToNewBlockRule(draft));
      }
      router.back();
    } catch {
      haptic('error');
      setSaveFailed(true);
      setBusy(false);
    }
  };

  const goBackOrExit = () => {
    if (step > 0) {
      haptic('light');
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const primaryLabel =
    step === TOTAL_STEPS - 1
      ? busy
        ? rulesStrings.create.saving
        : editing
          ? rulesStrings.create.save
          : rulesStrings.create.create
      : rulesStrings.create.nextWhen;

  const onPrimary = () => {
    if (step === TOTAL_STEPS - 1) {
      void submit();
    } else {
      haptic('light');
      setStep(step + 1);
    }
  };

  const currentProblems = stepProblems(step);
  const caption =
    currentProblems.length > 0
      ? currentProblems.map((problem) => PROBLEM_COPY[problem]).join(' ')
      : step === 1
        ? `${formatDays(daysRule(draft.days))} · ${formatRangeWithDuration(draft.startMin, draft.endMin)}`
        : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={goBackOrExit}
        backA11yLabel={rulesStrings.create.closeA11y}
        title={editing ? rulesStrings.create.editTitle : rulesStrings.create.titleSchedule}
        right={
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index <= step ? colors.text : colors.track,
                  },
                ]}
              />
            ))}
          </View>
        }
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      />

      <ScrollView
        style={styles.stepBody}
        // flexGrow: 1 lets the full-screen Apps step (flex: 1 children) fill
        // the viewport — the content container is content-sized without it.
        // Step 2 scrolls: its content is taller than the screen either way.
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xxl, paddingBottom: 16 }}
        bounces={false}
        alwaysBounceHorizontal={false}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? (
          <View style={styles.fill}>
            <Text style={[typography.micro, styles.fieldLabel, { color: colors.textFaint }]}>
              {rulesStrings.create.stepApps.toUpperCase()}
            </Text>
            <View style={styles.fill}>
              <AppPicker
                selectionRef={draft.selectionRef}
                selectionCount={draft.selectionCount}
                selectionLabel={draft.selectionLabel}
                onChange={({ selectionRef, selectionCount, selectionLabel, webDomainCount }) =>
                  patch({ selectionRef, selectionCount, selectionLabel, webDomainCount })
                }
              />
            </View>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.stepContent}>
            {editing ? (
              <>
                <Text style={[typography.micro, styles.fieldLabel, { color: colors.textFaint }]}>
                  {rulesStrings.create.nameLabel.toUpperCase()}
                </Text>
                <TextInput
                  value={draft.title ?? ''}
                  onChangeText={(title) => patch({ title })}
                  placeholder={rulesStrings.create.namePlaceholder}
                  placeholderTextColor={colors.textFaint}
                  style={[
                    typography.body,
                    styles.nameField,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  returnKeyType="done"
                />
              </>
            ) : null}

            <Text style={[typography.micro, styles.fieldLabel, { color: colors.textFaint }]}>
              {rulesStrings.create.daysLabel.toUpperCase()}
            </Text>
            <View style={styles.daysRow}>
              {weekOrder.map((day) => {
                const selected = draft.days.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={rulesStrings.days.weekdayShort[day]}
                    onPress={() => toggleDay(day)}
                    style={[
                      styles.dayCell,
                      {
                        borderRadius: 16,
                        backgroundColor: selected ? colors.text : colors.raised,
                        borderColor: selected ? colors.text : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: selected ? colors.onAccent : colors.textMuted },
                      ]}
                    >
                      {rulesStrings.days.weekdayShort[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[typography.micro, styles.fieldLabel, { color: colors.textFaint }]}>
              {rulesStrings.create.timeLabel.toUpperCase()}
            </Text>
            <Text style={[typography.callout, styles.wheelLabel, { color: colors.textMuted }]}>
              {rulesStrings.create.startLabel}
            </Text>
            <TimePickerWheel
              value={draft.startMin}
              onChange={(startMin) =>
                // Only a zero-length window is bumped; end < start is a
                // valid overnight window (23:00 → 01:00).
                patch({
                  startMin,
                  endMin:
                    draft.endMin === startMin
                      ? (startMin + MINUTES_STEP) % MINUTES_PER_DAY
                      : draft.endMin,
                })
              }
              height={170}
            />
            <Text style={[typography.callout, styles.wheelLabel, { color: colors.textMuted }]}>
              {rulesStrings.create.endLabel}
            </Text>
            <TimePickerWheel value={draft.endMin} onChange={(endMin) => patch({ endMin })} height={170} />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.ctaBar,
          {
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: spacing.xxl,
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
          },
        ]}
      >
        {saveFailed ? (
          <Text style={[typography.caption, styles.caption, { color: colors.danger }]}>
            {rulesStrings.create.saveFailed}
          </Text>
        ) : caption ? (
          <Text style={[typography.caption, styles.caption, { color: colors.textFaint }]}>
            {caption}
          </Text>
        ) : null}
        <Button
          label={primaryLabel}
          onPress={onPrimary}
          disabled={stepProblems(step).length > 0 || busy}
          fullWidth
        />
      </View>
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
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepBody: {
    flex: 1,
    paddingTop: 8,
  },
  fill: {
    flex: 1,
  },
  stepContent: {
    gap: 12,
  },
  fieldLabel: {
    // micro overline
  },
  nameField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCell: {
    flex: 1,
    height: 52,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelLabel: {
    marginTop: 4,
  },
  ctaBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  caption: {
    textAlign: 'center',
  },
});
