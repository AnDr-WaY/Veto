import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RulesRepository } from '@/core/contracts';
import { useBlockNotificationSync } from '@/features/onboarding';
import { useLiveActivitySync } from '@/features/liveActivity';
import { configureRulesBackend, isDemoEngine } from '@/features/rules/data';
import { eventLog, MmkvRulesRepository } from '@/features/storage';
import { useTheme } from '@/ui';
import { AppProviders, getEngine, useRulesStore } from '@/store';

/**
 * Root layout — final wiring (Ч6 owns this file's final form):
 * safe-area + persisted theme (AppProviders) + router, the rules data seam
 * pointed at the real persistence/engine in native mode, DeviceActivity
 * re-armed on every foreground, the block-notification sync kept in
 * step with the live rules and toggles, and the lock-screen activity
 * synced with the actually running block.
 */

// --------------------------------------------------------------------------
// Root wiring (module scope — runs once per JS context)
// --------------------------------------------------------------------------

/**
 * Rules screens (Ч4) read through the rules data seam, which defaults to an
 * in-memory mock. Point it at the real MMKV repository and the blocking
 * engine once here, so blocks created in the UI persist and actually arm
 * DeviceActivity. Demo mode (EXPO_PUBLIC_ENGINE=mock / Expo Go) keeps the
 * in-memory mock, which now starts empty — no seeded demo blocks.
 *
 * The thin wrapper mirrors every seam mutation into the event log, so
 * stats (E5) see rule_applied / rule_removed rows on the seam path too
 * (the zustand store path already logs its own).
 */
function wireRulesBackend(): void {
  if (isDemoEngine()) {
    return;
  }
  const inner = new MmkvRulesRepository();
  const logging: RulesRepository = {
    async list() {
      return inner.list();
    },
    async get(id) {
      return inner.get(id);
    },
    async save(rule) {
      const existing = await inner.get(rule.id);
      await inner.save(rule);
      await eventLog.record('rule_applied', rule.id, {
        title: rule.title,
        rearmed: existing !== null,
      });
    },
    async remove(id) {
      const existing = await inner.get(id);
      await inner.remove(id);
      await eventLog.record('rule_removed', id, { title: existing?.title ?? '' });
    },
    // Live-update seam: useRules() subscribes through the wrapper, mutations
    // emit from the inner repository — pause/edit render in the same tick.
    subscribe(listener) {
      return inner.subscribe(listener);
    },
  };
  configureRulesBackend({ repository: logging, engine: getEngine() });
  // Stats summary reads rules through the zustand store — hydrate it once.
  void useRulesStore.getState().refresh().catch(() => undefined);
}

wireRulesBackend();

/**
 * DeviceActivity schedules live inside the system, but they must be re-armed
 * after reboots, entitlement changes and rule edits made outside this JS
 * context. Fire once at launch and on every foreground (UX criterion:
 * blocking survives a reboot).
 *
 * RECONCILE DISABLED (kill switch): reconcile → remove() runs the full
 * native unblock/cleanup pipeline at launch, and that pipeline aborts the
 * app with an uncaught NSException on a dispatch queue when tearing down a
 * ghost entry (crash log Veto-2026-10-23-191854.ips). Until the native path
 * is fixed in a build, reconciliation stays off.
 */
const RECONCILE_ENABLED = false;

function useRearmOnActive(): void {
  useEffect(() => {
    void (async () => {
      if (RECONCILE_ENABLED) {
        // Rules first: reconciliation needs the ids that actually exist in
        // storage, so ghost enforcement (rule lost to a wiped storage) is
        // torn down instead of silently blocking forever.
        await useRulesStore.getState().refresh().catch(() => undefined);
        await getEngine()
          .reconcile(useRulesStore.getState().rules.map((rule) => rule.id))
          .catch(() => undefined);
      }
      await getEngine().rearmAll().catch(() => undefined);
    })();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void getEngine().rearmAll().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);
}

// --------------------------------------------------------------------------
// Layout
// --------------------------------------------------------------------------

/**
 * Themed chrome lives UNDER AppProviders: RootLayout itself renders outside
 * the ThemeProvider, so the background and status bar style resolve here,
 * where useTheme() is available. The NATIVE root window is also painted with
 * the theme background (expo-system-ui) — the window is white by default and
 * shows through during scroll rubber-banding and screen transitions in the
 * dark theme.
 */
function ThemedRoot({ children }: { children: ReactNode }) {
  const { name, colors } = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {children}
    </View>
  );
}

/**
 * The navigator itself must sit under the ThemeProvider: `contentStyle`
 * paints each native screen, and the React Navigation theme paints the
 * STACK CONTAINER underneath them (`nativeContainerBackgroundColor` comes
 * from nav theme `colors.background`) — without the override it stays the
 * light DefaultTheme gray and flashes white under the screens during
 * swipe transitions in the dark theme.
 */
function RootNavigator() {
  const { name, colors } = useTheme();
  const navTheme = useMemo(() => {
    const base = name === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.raised,
        text: colors.text,
        border: colors.border,
        primary: colors.text,
      },
    };
  }, [name, colors]);

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          // Themed stack container: no white flash between screens during the
          // native swipe-back, in either theme.
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="settings" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useRearmOnActive();
  useBlockNotificationSync();
  useLiveActivitySync();

  return (
    <SafeAreaProvider>
      <AppProviders>
        <ThemedRoot>
          <RootNavigator />
        </ThemedRoot>
      </AppProviders>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
