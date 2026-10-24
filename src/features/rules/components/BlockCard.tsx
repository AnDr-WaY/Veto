/**
 * Presentational card for one block (Home list, detail flows).
 * State chip label/tone derive from ruleState() in the view-model.
 */

import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { BlockChip, Card, useTheme } from '@/ui';
import type { BlockRule } from '@/core/contracts';
import { formatRangeWithDuration, ruleState, formatRuleDays, strictnessTitle } from '../viewModel';
import { rulesStrings } from '../strings';

const STATE_TONE = {
  paused: 'idle',
  active: 'blocked',
  upcoming: 'active',
  done: 'idle',
  offDay: 'idle',
} as const;

const STATE_LABEL = {
  paused: rulesStrings.state.paused,
  active: rulesStrings.state.active,
  upcoming: rulesStrings.state.upcoming,
  done: rulesStrings.state.done,
  offDay: rulesStrings.state.offDay,
} as const;

export interface BlockCardProps {
  rule: BlockRule;
  nowMin: number;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Hide the state chip (for tighter layouts). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
}

export function BlockCard({
  rule,
  nowMin,
  weekday,
  compact = false,
  style,
  titleStyle,
}: BlockCardProps) {
  const { colors, typography, spacing } = useTheme();
  const state = ruleState(rule, nowMin, weekday);

  return (
    <Card style={style}>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text numberOfLines={1} style={[typography.title3, { color: colors.text }, titleStyle]}>
            {rule.title}
          </Text>
          <Text style={[typography.callout, styles.meta, { color: colors.textMuted }]}>
            {[
              formatRangeWithDuration(rule.startMin, rule.endMin),
              formatRuleDays(rule),
              strictnessTitle(rule.strictness),
            ].join(' · ')}
          </Text>
        </View>
        {compact ? null : <BlockChip label={STATE_LABEL[state]} tone={STATE_TONE[state]} />}
      </View>
      <View style={{ height: spacing.xs }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  main: {
    flex: 1,
    gap: 2,
  },
  meta: {
    marginTop: 2,
  },
});
