import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {ThemeProvider, useTheme} from './Theme';
import {radius, spacing} from './tokens';
import {Button} from './components/Button';
import {Card} from './components/Card';
import {Row} from './components/Row';
import {FAB} from './components/FAB';
import {BlockChip} from './components/BlockChip';
import {TimelineBar} from './components/TimelineBar';
import {DayDial} from './components/DayDial';
import {TimeStepper} from './components/TimeStepper';
import {StrictnessCard} from './components/StrictnessCard';
import type {StrictnessMode} from './components/StrictnessCard';
import {ShieldLayout} from './components/ShieldLayout';
import {EmptyState} from './components/EmptyState';

function Section({title, children}: {title: string; children: React.ReactNode}) {
  const {colors, typography} = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[typography.micro, {color: colors.textMuted}]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/**
 * Design-system gallery: renders every component with EN sample copy.
 * The theme button flips light/dark (strict inversion).
 */
export function Demo() {
  return (
    <ThemeProvider initial="light">
      <DemoContent />
    </ThemeProvider>
  );
}

function DemoContent() {
  const {colors, typography, name, toggle} = useTheme();
  const [threshold, setThreshold] = useState(45);
  const [strictness, setStrictness] = useState<StrictnessMode>('hard');

  return (
    <View style={[styles.root, {backgroundColor: colors.bg}]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.title1, {color: colors.text}]}>Veto design system</Text>
          <Button label={`Theme: ${name}`} variant="secondary" size="md" onPress={toggle} />
        </View>

        <Section title="Buttons">
          <View style={styles.stack}>
            <Button label="Block now" onPress={() => undefined} fullWidth />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Options" variant="secondary" onPress={() => undefined} />
              </View>
              <View style={styles.flex}>
                <Button label="Skip" variant="ghost" onPress={() => undefined} />
              </View>
            </View>
            <Button label="Disabled" disabled />
          </View>
        </Section>

        <Section title="Chips">
          <View style={styles.row}>
            <BlockChip label="Off" tone="idle" />
            <BlockChip label="Active" tone="active" />
            <BlockChip label="Blocked" tone="blocked" />
          </View>
        </Section>

        <Section title="Day dial">
          <DayDial
            timeLabel="14:00"
            caption="Blocking 9:00–17:00"
            hours={[9, 10, 11, 12, 13, 14, 15, 16]}
            nowHour={14}
          />
        </Section>

        <Section title="Timeline">
          <TimelineBar
            segments={[
              {start: 0, end: 0.375, tone: 'blocked'},
              {start: 0.375, end: 0.5, tone: 'active'},
              {start: 0.7, end: 0.85, tone: 'blocked'},
            ]}
            now={0.58}
          />
        </Section>

        <Section title="Stepper">
          <TimeStepper
            label="Threshold"
            value={threshold}
            onChange={setThreshold}
            min={0}
            max={240}
            step={15}
          />
        </Section>

        <Section title="Strictness">
          <View style={styles.stack}>
            <StrictnessCard
              mode="threshold"
              title="Threshold"
              description="Shield after N minutes of use."
              selected={strictness === 'threshold'}
              onPress={() => setStrictness('threshold')}
            />
            <StrictnessCard
              mode="hard"
              title="Hard"
              description="Only Close. No way around it."
              selected={strictness === 'hard'}
              onPress={() => setStrictness('hard')}
            />
          </View>
        </Section>

        <Section title="Rows">
          <Card padded={false} style={styles.overflow}>
            <Row
              left={<Text style={[typography.body, {color: colors.text}]}>Screen Time permission</Text>}
              right={<BlockChip label="On" tone="active" />}
              onPress={() => undefined}
            />
          </Card>
        </Section>

        <Section title="Empty state">
          <EmptyState
            title="No rules yet"
            message="Create your first blocking rule to reclaim your focus."
            action={<Button label="Create rule" size="md" onPress={() => undefined} />}
          />
        </Section>

        <Section title="Shield">
          <View
            style={[
              styles.overflow,
              {height: 420, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth},
            ]}>
            <ShieldLayout
              appName="Veto"
              untilLabel="2h 15m"
              strictness="hard"
              strictnessLabel="Hard block"
              message="This block can't be dismissed."
            />
          </View>
        </Section>
      </ScrollView>
      <FAB label="Add rule" onPress={() => undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    gap: spacing.xxxl,
    padding: spacing.xl,
    paddingBottom: spacing.giant,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  section: {
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  overflow: {
    overflow: 'hidden',
    borderRadius: radius.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});

export default Demo;
