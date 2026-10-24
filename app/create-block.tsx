/**
 * Quick block creation — a wizard with one screen per decision:
 * (1) which apps (full-screen picker), (2) until what time + soft/hard.
 * The block starts the moment Create is tapped — there is deliberately no
 * start-time field and no repeats; that is the schedule's job.
 *
 * The same wizard edits an existing quick block: pushed with `?edit=<id>`
 * from the detail screen, prefilled from the rule and saved over it (the
 * stored window start is kept — only what the user changes is written).
 */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, ScreenHeader, TimePickerWheel, useTheme } from '@/ui';
import { strings as coreStrings } from '@/core/strings';
import { haptic } from '@/lib/haptics';
import type { BlockRule } from '@/core/contracts';
import { useRuleActions, useRules } from '@/features/rules/hooks';
import {
  blockRuleToQuickDraft,
  defaultQuickDraft,
  formatRangeWithDuration,
  nowMinutesLocal,
  quickDraftProblems,
  quickDraftToNewBlockRule,
  type QuickBlockDraft,
  type QuickDraftProblem,
} from '@/features/rules/viewModel';
import { rulesStrings } from '@/features/rules/strings';
import { AppPicker } from '@/features/rules/components/AppPicker';

const TOTAL_STEPS = 2;

const PROBLEM_COPY: Record<QuickDraftProblem, string> = {
  selectionEmpty: rulesStrings.create.problemSelection,
  untilInvalid: rulesStrings.create.problemUntil,
};

export default function CreateBlockScreen() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const editId = typeof params.edit === 'string' ? params.edit : '';

  if (editId.length === 0) {
    return <QuickBlockWizard editRule={null} />;
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
    return <QuickBlockWizard key={editRule.id} editRule={editRule} />;
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

function QuickBlockWizard({ editRule }: { editRule: BlockRule | null }) {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useRuleActions();
  const editing = editRule !== null;

  // "Now" frozen once per screen mount — ref reads during render are
  // forbidden by the SDK 57 react-hooks rules, so capture into state.
  const [nowMin] = useState(() => nowMinutesLocal());
  const [draft, setDraft] = useState<QuickBlockDraft>(() =>
    editing ? blockRuleToQuickDraft(editRule) : defaultQuickDraft(nowMinutesLocal()),
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // The wizard must never fail silently: a thrown save (e.g. the native
  // engine rejecting the rule) is surfaced next to the CTA.
  const [saveFailed, setSaveFailed] = useState(false);

  const problems = useMemo(() => quickDraftProblems(draft, nowMin), [draft, nowMin]);

  const patch = (next: Partial<QuickBlockDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const stepProblems = (index: number): QuickDraftProblem[] => {
    if (index === 0) {
      return problems.filter((problem) => problem === 'selectionEmpty');
    }
    return problems;
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
        // Edit: keep the rule's original window start — only the picked
        // apps, end time, mode and (renamed) title are saved over it.
        await actions.update(editRule.id, quickDraftToNewBlockRule(draft, editRule.startMin));
      } else {
        await actions.create(quickDraftToNewBlockRule(draft, nowMin));
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
      : rulesStrings.create.nextUntil;

  const onPrimary = () => {
    if (step === TOTAL_STEPS - 1) {
      void submit();
    } else {
      haptic('light');
      setStep(step + 1);
    }
  };

  // Caption under the CTA: the step's problem, or a live preview.
  const currentProblems = stepProblems(step);
  const caption =
    currentProblems.length > 0
      ? currentProblems.map((problem) => PROBLEM_COPY[problem]).join(' ')
      : step === 1
        ? `${rulesStrings.create.untilLabel}: ${formatRangeWithDuration(editing ? editRule.startMin : nowMin, draft.endMin)}`
        : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={goBackOrExit}
        backA11yLabel={rulesStrings.create.closeA11y}
        title={editing ? rulesStrings.create.editTitle : rulesStrings.create.titleQuick}
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

      <View style={[styles.stepBody, { paddingHorizontal: spacing.xxl }]}>
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
              {rulesStrings.create.untilLabel.toUpperCase()}
            </Text>
            {editing ? null : (
              <Text style={[typography.callout, { color: colors.textMuted }]}>
                {rulesStrings.create.startsNowNote}
              </Text>
            )}
            <TimePickerWheel
              value={draft.endMin}
              onChange={(endMin) => patch({ endMin })}
              height={220}
            />
          </View>
        ) : null}
      </View>

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
    flex: 1,
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
  ctaBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  caption: {
    textAlign: 'center',
  },
});
