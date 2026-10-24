/**
 * Apps step of the creation flows — a full screen, not a sheet.
 *
 * Demo mode (Expo Go / mock engine): a searchable catalog grouped by
 * category. Categories come from the appCatalog seam — real App Store
 * genres fetched via the iTunes Lookup API with a static fallback. A tap on
 * a category header selects (or clears) the whole category; a tap on an app
 * toggles it. There is no separate "Selected" section — selection state is
 * the checkmark on the row itself.
 *
 * Real iOS build: Apple's FamilyActivityPicker (DeviceActivitySelectionView)
 * embedded full-height — the device app list with icons is only ever exposed
 * through that native view, so the JS side shows the selection count there.
 * The picker renders a silently empty list until the app holds Family
 * Controls authorization, so the native branch gates on it first: a Screen
 * Time explanation with Allow, swapped for the picker once approved.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ActivitySelectionWithMetadata } from 'react-native-device-activity';
import type { AuthStatus } from '@/core/contracts';
import { isExpoGo } from '@/core/environment';
import { familyControlsAuthStatus, getBlockingEngine } from '@/features/blocking';
import { Button, EmptyState, Icon, useTheme } from '@/ui';
import { haptic } from '@/lib/haptics';
import {
  CATALOG_APPS,
  CATEGORY_ORDER,
  fetchCategoryOverrides,
  type CatalogApp,
  type CatalogCategory,
} from '../appCatalog';
import { demoSelectionRef, parseDemoSelection } from '../__mocks__/mockBackend';
import { isDemoEngine } from '../data';
import { rulesStrings } from '../strings';

export interface AppPickerProps {
  /** Currently encoded selection ('' when nothing is picked). */
  selectionRef: string;
  /** Selected item count (apps + web domains). */
  selectionCount: number;
  /** Human-readable label (demo mode: app names). Kept for parity. */
  selectionLabel: string;
  onChange: (next: {
    selectionRef: string;
    selectionCount: number;
    selectionLabel: string;
    /** Web domains inside the selection (0 for the demo catalog). */
    webDomainCount: number;
  }) => void;
}

/** Marker for the demo catalog picker (Expo Go / demo mode / non-iOS). */
function useDemoPicker(): boolean {
  return useMemo(() => isDemoEngine() || isExpoGo() || Platform.OS !== 'ios', []);
}

// ---------------------------------------------------------------------------
// Monogram tile — the app "icon": rounded square with the initial
// ---------------------------------------------------------------------------

function AppIcon({
  name,
  size = 40,
  selected = false,
}: {
  name: string;
  size?: number;
  selected?: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={[
        styles.iconTile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: selected ? colors.text : colors.surface,
          borderColor: selected ? colors.text : colors.border,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          typography.callout,
          styles.iconLetter,
          {
            fontSize: size * 0.42,
            lineHeight: size * 0.46,
            color: selected ? colors.onAccent : colors.textMuted,
          },
        ]}
      >
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Demo picker: search + compact category chips + grouped full-height list
// ---------------------------------------------------------------------------

function DemoAppList({
  selected,
  onSetApps,
}: {
  selected: Set<string>;
  /** Select or clear the given app ids, emitted as one change. */
  onSetApps: (ids: string[], select: boolean) => void;
}) {
  const { colors, typography, radius } = useTheme();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CatalogCategory | 'all'>('all');
  /** Real App Store genres, fetched once per session (static fallback). */
  const [overrides, setOverrides] = useState<Partial<Record<string, CatalogCategory>>>({});

  useEffect(() => {
    let alive = true;
    fetchCategoryOverrides()
      .then((fetched) => {
        if (alive) {
          setOverrides(fetched);
        }
      })
      .catch(() => {
        // Static categories stay.
      });
    return () => {
      alive = false;
    };
  }, []);

  const query = search.trim().toLowerCase();

  const groups = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      apps: CATALOG_APPS.filter(
        (app) =>
          (overrides[app.id] ?? app.category) === cat &&
          (category === 'all' || category === cat) &&
          (query.length === 0 || app.name.toLowerCase().includes(query)),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.apps.length > 0);
  }, [category, query, overrides]);

  const renderApp = (app: CatalogApp) => {
    const isSelected = selected.has(app.id);
    return (
      <Pressable
        key={app.id}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={app.name}
        onPress={() => {
          haptic('light');
          onSetApps([app.id], !isSelected);
        }}
        style={({ pressed }) => [styles.appRow, pressed && styles.pressed]}
      >
        <AppIcon name={app.name} selected={isSelected} />
        <Text style={[typography.body, styles.appName, { color: colors.text }]}>{app.name}</Text>
        {isSelected ? <Icon name="checkmark" size={20} weight="bold" color={colors.text} /> : null}
      </Pressable>
    );
  };

  const renderGroup = (group: { category: CatalogCategory; apps: CatalogApp[] }) => {
    const allSelected = group.apps.every((app) => selected.has(app.id));
    const label = rulesStrings.apps.categories[group.category] ?? group.category;
    return (
      <View key={group.category} style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => {
            haptic('light');
            onSetApps(
              group.apps.map((app) => app.id),
              !allSelected,
            );
          }}
          style={({ pressed }) => [styles.sectionHeaderRow, pressed && styles.pressed]}
        >
          <Text style={[typography.micro, styles.sectionHeader, { color: colors.textFaint }]}>
            {label.toUpperCase()}
          </Text>
          <Icon
            name={allSelected ? 'checkmark.circle.fill' : 'plus.circle'}
            size={16}
            color={colors.textFaint}
          />
        </Pressable>
        {group.apps.map(renderApp)}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <View style={styles.searchField}>
        <Icon name="magnifyingglass" size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={rulesStrings.create.appsSearchPlaceholder}
          placeholderTextColor={colors.textFaint}
          style={[typography.body, styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        alwaysBounceVertical={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipContent}
      >
        {(['all', ...CATEGORY_ORDER] as const).map((item) => {
          const selectedChip = category === item;
          const label =
            item === 'all'
              ? rulesStrings.create.appsAllCategory
              : rulesStrings.apps.categories[item];
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedChip }}
              onPress={() => {
                haptic('light');
                setCategory(item);
              }}
              style={[
                styles.categoryChip,
                { borderRadius: radius.full },
                selectedChip
                  ? { backgroundColor: colors.text }
                  : { backgroundColor: 'transparent' },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  { color: selectedChip ? colors.onAccent : colors.textFaint },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.fill}
        bounces={false}
        alwaysBounceHorizontal={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
      >
        {groups.map(renderGroup)}
        {groups.length === 0 && (query.length > 0 || category !== 'all') ? (
          <Text style={[typography.callout, styles.noResults, { color: colors.textFaint }]}>
            {rulesStrings.apps.noResults}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Native picker: Apple's FamilyActivityPicker, full height
// ---------------------------------------------------------------------------

function NativeAppList({
  selection,
  selectionCount,
  onChange,
}: {
  selection: string;
  /** Selected item count (apps + web domains), echoed by the engine. */
  selectionCount: number;
  onChange: (event: { nativeEvent: ActivitySelectionWithMetadata }) => void;
}) {
  const { colors, typography } = useTheme();
  // Guarded require: the native view throws at import time under Expo Go.
  // NativeAppList only renders outside Expo Go — i.e. inside a real
  // dev-client build, where the view exists.
  const { DeviceActivitySelectionView } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-device-activity') as typeof import('react-native-device-activity');

  return (
    // No frame: the system picker sits full-bleed on the screen
    // background under a quiet header row (overline + selected count).
    <View style={styles.nativeHost}>
      <View style={styles.nativeHeader}>
        <Text style={[typography.micro, { color: colors.textFaint }]}>
          {rulesStrings.apps.pickerTitle.toUpperCase()}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {rulesStrings.apps.nativeSelected(selectionCount)}
        </Text>
      </View>
      <DeviceActivitySelectionView
        style={styles.nativePicker}
        familyActivitySelection={selection}
        onSelectionChange={onChange}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Family Controls gate — Apple's picker is empty until the app is authorized
// ---------------------------------------------------------------------------

/**
 * Authorization state for the native picker. The initial status is read
 * without prompting; `request` runs the engine's authorize() (system dialog
 * + poll), which resolves the actual user decision and never rejects.
 */
function useFamilyControlsAuth(): {
  status: AuthStatus;
  requesting: boolean;
  /** Last request ended without approval (declined or cancelled). */
  failed: boolean;
  request: () => void;
} {
  const [status, setStatus] = useState<AuthStatus>(() => familyControlsAuthStatus());
  const [requesting, setRequesting] = useState(false);
  const [failed, setFailed] = useState(false);

  // The gate must never shadow an existing grant: the system can report a
  // stale notDetermined while the authorization center warms up, and the
  // user can revoke from Settings — so settle-poll a few times on mount and
  // re-read on foreground before trusting a non-approved answer.
  useEffect(() => {
    let alive = true;
    let attempts = 0;
    const recheck = () => {
      const next = familyControlsAuthStatus();
      if (alive) {
        setStatus(next);
      }
      return next === 'approved';
    };
    if (recheck()) {
      return;
    }
    const settle = setInterval(() => {
      attempts += 1;
      if (!alive || recheck() || attempts >= 4) {
        clearInterval(settle);
      }
    }, 250);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        recheck();
      }
    });
    return () => {
      alive = false;
      clearInterval(settle);
      sub.remove();
    };
  }, []);

  const request = () => {
    if (requesting) {
      return;
    }
    setRequesting(true);
    void getBlockingEngine()
      .authorize()
      .then((next) => {
        setStatus(next);
        setFailed(next !== 'approved');
      })
      .finally(() => setRequesting(false));
  };

  return { status, requesting, failed, request };
}

function AuthGate({
  requesting,
  failed,
  onAllow,
}: {
  requesting: boolean;
  failed: boolean;
  onAllow: () => void;
}) {
  return (
    <View style={styles.authGate}>
      <EmptyState
        icon="hand.raised"
        title={rulesStrings.apps.auth.title}
        message={failed ? rulesStrings.apps.auth.denied : rulesStrings.apps.auth.message}
        action={
          <Button
            label={
              requesting
                ? rulesStrings.apps.auth.allowing
                : failed
                  ? rulesStrings.apps.auth.retry
                  : rulesStrings.apps.auth.allow
            }
            onPress={onAllow}
            disabled={requesting}
            fullWidth
          />
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AppPicker({ selectionRef, selectionCount, onChange }: AppPickerProps) {
  const useDemo = useDemoPicker();
  const auth = useFamilyControlsAuth();

  const demoSelected = useMemo(
    () => new Set(useDemo ? parseDemoSelection(selectionRef) : []),
    [useDemo, selectionRef],
  );

  /** Select or clear ids in one change — single taps and category taps. */
  const setApps = (ids: string[], select: boolean) => {
    const next = new Set(demoSelected);
    for (const id of ids) {
      if (select) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    const names = CATALOG_APPS.filter((app) => next.has(app.id)).map((app) => app.name);
    onChange({
      selectionRef: next.size > 0 ? demoSelectionRef([...next]) : '',
      selectionCount: next.size,
      selectionLabel: names.join(', '),
      webDomainCount: 0,
    });
  };

  const onNativeSelection = (event: { nativeEvent: ActivitySelectionWithMetadata }) => {
    const data = event.nativeEvent;
    const webDomainCount = data.webDomainCount ?? 0;
    onChange({
      selectionRef: data.familyActivitySelection ?? '',
      selectionCount: (data.applicationCount ?? 0) + webDomainCount,
      selectionLabel: '',
      webDomainCount,
    });
  };

  return useDemo ? (
    <DemoAppList selected={demoSelected} onSetApps={setApps} />
  ) : auth.status === 'approved' ? (
    <NativeAppList
      selection={selectionRef}
      selectionCount={selectionCount}
      onChange={onNativeSelection}
    />
  ) : (
    <AuthGate requesting={auth.requesting} failed={auth.failed} onAllow={auth.request} />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  iconTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconLetter: {
    fontWeight: '600',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    padding: 0,
  },
  chipRow: {
    height: 28,
    flexGrow: 0,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  listContent: {
    paddingBottom: 24,
  },
  section: {
    marginTop: 12,
    gap: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sectionHeader: {
    // micro overline
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  appName: {
    flex: 1,
  },
  noResults: {
    textAlign: 'center',
    paddingVertical: 24,
  },
  nativeHost: {
    flex: 1,
    minHeight: 320,
  },
  nativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  nativePicker: {
    flex: 1,
  },
  authGate: {
    flex: 1,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
