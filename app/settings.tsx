import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import {
  Card,
  Glass,
  Icon,
  IconButton,
  Row,
  Sheet,
  spacing,
  typography,
  useTheme,
} from '@/ui';
import { strings as coreStrings } from '@/core/strings';
import {
  OptionPicker,
  ToggleRow,
  settingsStrings,
  type ThemePreferenceValue,
} from '@/features/settings';import {
  LIVE_ACTIVITY_MODE_OPTIONS,
  liveActivityStrings,
  liveActivitySupport,
  type LiveActivitySupport,
} from '@/features/liveActivity';
import type { LiveActivityMode } from '@/features/storage';
import { resetAllData } from '@/features/storage';
import { useVetoSettings } from '@/store';
import { haptic } from '@/lib/haptics';

const THEME_OPTIONS: readonly { value: ThemePreferenceValue; label: string }[] = [
  { value: 'system', label: settingsStrings.theme.system },
  { value: 'light', label: settingsStrings.theme.light },
  { value: 'dark', label: settingsStrings.theme.dark },
];

type OpenSheet = 'support' | 'about' | 'privacy' | 'terms' | null;

function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.1.0';
}

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[typography.micro, styles.sectionLabel, { color: colors.textFaint }]}>
      {children}
    </Text>
  );
}

/**
 * E6 Settings: one scrolling page (header included). The support / about
 * sheets are fixed overlays pinned to the screen — they never scroll with
 * the content.
 */
export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update } = useVetoSettings();

  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [canReview, setCanReview] = useState(false);
  const [activitySupport, setActivitySupport] = useState<LiveActivitySupport>(() =>
    liveActivitySupport(),
  );

  // The system in-app review prompt only exists on some OS versions — the row
  // stays hidden when the device cannot show it.
  useEffect(() => {
    let cancelled = false;
    StoreReview.isAvailableAsync()
      .then((available) => {
        if (!cancelled) setCanReview(available);
      })
      .catch(() => {
        if (!cancelled) setCanReview(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live Activities can be switched off (or back on) in the system Settings
  // while Veto sits in the background — re-read the native support state
  // every time the app returns to the foreground. One read per activation,
  // no polling (the activity itself is synced by useLiveActivitySync).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setActivitySupport(liveActivitySupport());
      }
    });
    return () => subscription.remove();
  }, []);

  const hapticsOn = settings.hapticsEnabled;

  /**
   * The row only flips the persisted feature switch — the controller starts
   * / stops the activity on the next sync (fires through the store change).
   */
  const toggleLockActivity = useCallback(() => {
    haptic('light');
    void update({ liveActivityEnabled: !settings.liveActivityEnabled });
  }, [settings.liveActivityEnabled, update]);

  const changeActivityMode = useCallback(
    (mode: LiveActivityMode) => {
      void update({ liveActivityModes: mode });
    },
    [update],
  );

  const resetEverything = useCallback(() => {
    haptic('warning');
    void resetAllData();
  }, []);

  /** Developer: confirm first — the wipe cannot be undone. */
  const confirmResetAllData = useCallback(() => {
    haptic('light');
    Alert.alert(settingsStrings.dev.resetTitle, settingsStrings.dev.resetMessage, [
      { text: settingsStrings.dev.resetCancel, style: 'cancel' },
      { text: settingsStrings.dev.resetConfirm, style: 'destructive', onPress: resetEverything },
    ]);
  }, [resetEverything]);

  /**
   * `missing` hides the whole Blocking section (nothing to toggle — dead UI
   * is worse than no UI); `disabled` keeps the row and swaps the bare status
   * word for guidance. The status word is the feature switch itself — the
   * activity appears and disappears on its own as blocks start and end.
   */
  const activityStatus =
    activitySupport === 'disabled'
      ? liveActivityStrings.disabled
      : settings.liveActivityEnabled
        ? liveActivityStrings.on
        : liveActivityStrings.off;
  const activityStatusColor =
    activitySupport === 'disabled'
      ? colors.textMuted
      : settings.liveActivityEnabled
        ? colors.text
        : colors.textFaint;

  return (
    <>
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
            {settingsStrings.title}
          </Text>
        </View>

        {activitySupport !== 'missing' ? (
          <>
            <SectionLabel>{settingsStrings.sections.blocking}</SectionLabel>
            <Row
              onPress={toggleLockActivity}
              left={
                <Text style={[typography.body, { color: colors.text }]}>
                  {liveActivityStrings.rowTitle}
                </Text>
              }
              right={
                <Text style={[typography.body, { color: activityStatusColor }]}>
                  {activityStatus}
                </Text>
              }
            />
            {settings.liveActivityEnabled && activitySupport === 'ready' ? (
              <Card style={styles.modeCard}>
                <Text style={[typography.body, styles.modeLabel, { color: colors.text }]}>
                  {liveActivityStrings.modeTitle}
                </Text>
                <OptionPicker
                  options={LIVE_ACTIVITY_MODE_OPTIONS}
                  value={settings.liveActivityModes}
                  hapticsEnabled={hapticsOn}
                  label={liveActivityStrings.rowTitle}
                  onChange={changeActivityMode}
                />
              </Card>
            ) : null}
          </>
        ) : null}

        <SectionLabel>{settingsStrings.sections.notifications}</SectionLabel>
        <View style={styles.group}>
          <ToggleRow
            label={settingsStrings.notifications.blockStart}
            value={settings.notifyOnBlockStart}
            hapticsEnabled={hapticsOn}
            onChange={(next) => void update({ notifyOnBlockStart: next })}
            style={styles.groupFirst}
          />
          <ToggleRow
            label={settingsStrings.notifications.blockEnd}
            value={settings.notifyOnBlockEnd}
            hapticsEnabled={hapticsOn}
            onChange={(next) => void update({ notifyOnBlockEnd: next })}
            style={styles.groupLast}
          />
        </View>

        <SectionLabel>{settingsStrings.sections.appearance}</SectionLabel>
        <Card style={styles.themeCard}>
          <Text style={[typography.body, styles.themeLabel, { color: colors.text }]}>
            {settingsStrings.theme.title}
          </Text>
          <OptionPicker
            options={THEME_OPTIONS}
            value={settings.theme}
            hapticsEnabled={hapticsOn}
            label={settingsStrings.theme.title}
            onChange={(next) => void update({ theme: next })}
          />
        </Card>

        <SectionLabel>{settingsStrings.sections.support}</SectionLabel>
        <Row
          onPress={() => {
            haptic('light');
            setOpenSheet('support');
          }}
          left={
            <Text style={[typography.body, { color: colors.text }]}>
              {settingsStrings.support.row}
            </Text>
          }
          right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
        />

        <SectionLabel>{settingsStrings.sections.about}</SectionLabel>
        <Row
          onPress={() => {
            haptic('light');
            setOpenSheet('about');
          }}
          left={
            <Text style={[typography.body, { color: colors.text }]}>{settingsStrings.about.row}</Text>
          }
          right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
        />
        <Row
          onPress={() => {
            haptic('light');
            void Linking.openURL(settingsStrings.about.githubUrl);
          }}
          left={
            <Text style={[typography.body, { color: colors.text }]}>
              {settingsStrings.about.github}
            </Text>
          }
          right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
        />
        <Row
          onPress={() => {
            haptic('light');
            setOpenSheet('privacy');
          }}
          left={
            <Text style={[typography.body, { color: colors.text }]}>
              {settingsStrings.privacy.row}
            </Text>
          }
          right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
        />
        <Row
          onPress={() => {
            haptic('light');
            setOpenSheet('terms');
          }}
          left={
            <Text style={[typography.body, { color: colors.text }]}>
              {settingsStrings.terms.row}
            </Text>
          }
          right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
        />
        {canReview ? (
          <Row
            onPress={() => {
              haptic('light');
              void StoreReview.requestReview();
            }}
            left={
              <View style={styles.reviewLabel}>
                <Icon name="star" size={17} color={colors.text} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {settingsStrings.about.leaveReview}
                </Text>
              </View>
            }
            right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
          />
        ) : null}

        <SectionLabel>{settingsStrings.sections.dev}</SectionLabel>
        <Row
          onPress={confirmResetAllData}
          left={
            <Text style={[typography.body, { color: colors.text }]}>{settingsStrings.dev.reset}</Text>
          }
          right={<Icon name="chevron.right" size={14} color={colors.textFaint} />}
        />
      </ScrollView>

      {/* Sheets are fixed overlays pinned to the screen — never part of the
          scrolling content. */}
      <Sheet
        visible={openSheet === 'support'}
        onClose={() => setOpenSheet(null)}
        title={settingsStrings.support.sheetTitle}
      >
        <Text style={[typography.body, { color: colors.text }]}>
          {settingsStrings.support.body1}
        </Text>
        <Text style={[typography.body, { color: colors.text }]}>
          {settingsStrings.support.body2}
        </Text>
        <Text style={[typography.title3, { color: colors.text }]}>
          {settingsStrings.support.thanks}
        </Text>
      </Sheet>

      <Sheet
        visible={openSheet === 'about'}
        onClose={() => setOpenSheet(null)}
        title={settingsStrings.about.sheetTitle}
      >
        <Text style={[typography.body, { color: colors.text }]}>
          {settingsStrings.about.tagline}
        </Text>
        <Text style={[typography.callout, { color: colors.textMuted }]}>
          {settingsStrings.about.privacy}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {settingsStrings.about.version(appVersion())}
        </Text>
      </Sheet>

      <Sheet
        visible={openSheet === 'privacy'}
        onClose={() => setOpenSheet(null)}
        title={settingsStrings.privacy.sheetTitle}
      >
        <ScrollView style={styles.legalScroll}>
          {settingsStrings.privacy.paragraphs.map((paragraph) => (
            <Text key={paragraph.slice(0, 24)} style={[typography.callout, styles.legalText, { color: colors.text }]}>
              {paragraph}
            </Text>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={openSheet === 'terms'}
        onClose={() => setOpenSheet(null)}
        title={settingsStrings.terms.sheetTitle}
      >
        <ScrollView style={styles.legalScroll}>
          {settingsStrings.terms.paragraphs.map((paragraph) => (
            <Text key={paragraph.slice(0, 24)} style={[typography.callout, styles.legalText, { color: colors.text }]}>
              {paragraph}
            </Text>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backBubble: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  group: {
    gap: spacing.sm,
  },
  groupFirst: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  groupLast: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  themeCard: {
    gap: spacing.md,
  },
  themeLabel: {
    marginBottom: -spacing.sm,
  },
  modeCard: {
    gap: spacing.md,
  },
  modeLabel: {
    marginBottom: -spacing.sm,
  },
  reviewLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legalScroll: {
    maxHeight: 420,
  },
  legalText: {
    opacity: 0.9,
  },
});
