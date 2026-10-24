# Spike: Veto blocking engine (Ч3)

Date: 2026-10-20 · Owner: Ч3 (tbt-w3) · Status: **decided**

## Question

Which native layer implements the `BlockingEngine` contract
(`src/core/contracts.ts`) for schedule-based hard blocking on iOS 16+,
Expo SDK 55 / CNG?

Candidates:

1. `react-native-device-activity` (kingstinct) — RN/Expo-modules wrapper over
   FamilyControls + ManagedSettings + DeviceActivity, ships a config plugin
   that generates the 3 extension targets.
2. `expo-app-blocker` (eylonshm) — cross-platform Expo module (iOS + Android).
3. Own Swift module via Expo Modules API (last resort per the plan).

## Comparison

| Criterion | kingstinct r-n-device-activity | expo-app-blocker | own Swift module |
|---|---|---|---|
| Expo SDK 55 / CNG | ✅ already installed (0.6.1); prebuild generates 3 extension targets (verified in Ч1: `expo prebuild -p ios --no-install` green, targets Veto + ActivityMonitorExtension + ShieldAction + ShieldConfiguration) | ✅ config plugin, but young project, SDK 55 coverage unproven | ✅ by definition, but weeks of work |
| authorize (.individual) | ✅ `requestAuthorization('individual')` → `AuthorizationCenter.shared.requestAuthorization(for: .individual)`, plus `pollAuthorizationStatus` helper | ✅ iOS path exists, Android-first focus | ✅ manual wrap |
| scheduling (days/time/one-shot) | ✅ `startMonitoring(name, DeviceActivitySchedule, events)`; weekday components supported in `intervalStart/intervalEnd` → per-weekday activities; `repeats:false` + absolute date components for one-shots | ⚠️ schedule-level API thinner; no weekday/one-shot surface documented | ✅ manual |
| shield | ✅ vendored `ShieldConfiguration`/`ShieldAction` extension templates with a JS-configurable action pipeline (`configureActions` → extension executes `blockSelection`/`unblockSelection`/`startMonitoring`/…) | ⚠️ shield customization limited | ✅ manual ManagedSettingsUI |
| threshold (N min of use) | ✅ `DeviceActivityEvent(threshold:)` → `eventDidReachThreshold` in the monitor extension; usage counted inside the monitored interval | ❌ not exposed | ✅ manual |
| FamilyActivityPicker | ✅ `DeviceActivitySelectionViewPersisted` persists the encoded selection into the App Group registry (`familyActivitySelectionIds`) under a stable id — exactly the `selectionRef` model | ⚠️ own picker, tokens live in its own storage | ✅ manual |
| extension↔app data | ✅ App Group `UserDefaults` readable/writable from JS (`userDefaultsGet/Set/All`) and from every extension | ⚠️ own format | ✅ manual |
| maintenance risk | ⚠️ single maintainer; MIT; source is small and vendored into `targets/` (readable, patchable) | ⚠️ younger, smaller community; Android is the headline feature (we are iOS-only) | ⚠️ we own 100% of it forever |
| escape hatches | ✅ raw Swift in `targets/**` stays editable; lib can be dropped later behind `BlockingEngine` | ✅ | — |

## Decision

**kingstinct `react-native-device-activity` as the engine behind
`BlockingEngine`.** It is the only candidate that covers all four pillars
(authorize / schedule / shield / threshold) today, is already green on
SDK 55 CNG (verified by Ч1), and keeps every extension as plain Swift files in
`targets/**` — i.e. we are never locked in: the fallback path ("own Swift
module") is a strict subset of what we already have.

`expo-app-blocker` is rejected: iOS is not its focus, no threshold support, and
it would still leave us writing the same extension plumbing.
The own-Swift-module fallback stays available behind the same interface; the
engine module (`src/features/blocking`) is the only file that imports the lib.

## Architecture delivered by Ч3

```
src/features/blocking/
  index.ts               getBlockingEngine() factory (EXPO_PUBLIC_ENGINE=mock → MockBlockingEngine)
  ruleCompiler.ts        pure Rule → CompiledActivity[] (DeviceActivitySchedule + events)
  deviceActivityEngine.ts BlockingEngine + grace over react-native-device-activity
  mockEngine.ts          in-memory engine for demo/CI (no entitlement needed)
  appGroupStore.ts       typed App Group keys: mirror, shield meta, grace log
  SelectionPicker.tsx    FamilyActivityPicker wrapper → selectionRef + selectionCount
```

Mapping (all states live in the App Group `UserDefaults` suite
`group.io.veto.app`, so extensions and the app see the same data):

- **soft** — `intervalDidStart` → `blockSelection` (shield id = `selectionRef`);
  `intervalDidEnd` → `unblockSelection`. Shield primary button = grace:
  `unblockPossibleFamilyActivitySelection` + one-shot `veto_grace_<ruleId>`
  activity that re-blocks via `intervalDidEnd` after `graceMin`.
- **hard** — same schedule; shield primary button = Close only.
- **threshold** — no block at `intervalDidStart`; a `DeviceActivityEvent` with
  `threshold: {minute: thresholdMin}` fires `eventDidReachThreshold` →
  `blockSelection`; `intervalDidEnd` unblocks.
- **grace log** — `veto_grace_used_<ruleId>` (epoch ms) +
  `veto_grace_until_<ruleId>` written by the JS engine (in-app bypass) and by
  the ShieldAction extension (shield button bypass); per-day counter
  `veto_grace_day_<ruleId>` enforces `dailyGraceLimit`.
- **one-shot** — absolute date components, `repeats:false`; the extension's
  auto-persisted `events_…intervalDidEnd` timestamp is consumed by
  `rearmAll()`, which marks `veto_oneshot_done_<ruleId>` and stops re-arming.
- **rearmAll** — replays the engine's rule mirror (App Group key
  `veto_mirror_v1`); skips paused/one-shot-done/grace-active rules. Designed to
  be called on foreground / after reboot.
- **engine mirror** — `veto_mirror_v1` = `{[ruleId]: {rule, activities[], appliedAt}}`;
  `rearmAll()`/`pauseAll()` need it because the contract gives the engine no
  access to Ч5's repository.

Weekdays: `DeviceActivitySchedule` has no day filter, so a rule on N days
compiles to N activities `veto_rule_<id>_d<0..6>` (`weekday` component,
Apple numbering 1=Sunday); `daily` compiles to a single activity.

## Risks & mitigations

1. **The lib's config plugin copies its own extension templates over the app's
   `targets/` folder on every prebuild** (`withCopyTargetFolder` →
   `fs.cpSync(..., {recursive: true})`), which would revert the Veto shield
   customizations. Upstream already supports the documented plugin option
   **`copyToTargetFolder: false`** — filed as a fix-card for Ч1
   (single line in `app.config.ts`; Ч3 must not edit that file).
   Until it lands, a raw `expo prebuild` silently reverts `targets/**` Swift
   files (git restore brings them back).
2. **Family Controls entitlement** — DeviceActivity/ManagedSettings calls fail
   without it on device. Mitigation: `EXPO_PUBLIC_ENGINE=mock` keeps the whole
   UI alive for CI/previews; entitlement is already wired by Ч1
   (`com.apple.developer.family-controls` + App Group in all 4 targets).
3. **`appleTeamId` placeholder** (`TODO_APPLE_TEAM_ID`, Ч1 zone) must be
   replaced before any device build — known, tracked by Ч1.
4. **Simulator**: DeviceActivity extension callbacks are unreliable on the
   simulator; test schedules on real hardware. Mitigation: mock engine +
   unit-tested compiler.
5. **Interval already active when `apply()` runs** (rule created mid-window):
   `intervalDidStart` will not fire retroactively → the engine blocks
   immediately from JS when `now` is inside the window.
6. **Single-maintainer lib**: all engine code sits behind
   `src/features/blocking/index.ts`; the vendored `targets/**` Swift is in-repo,
   so a hard fork/patch is always possible (`patches/` kept for that purpose).
7. **`endMin === 1440` (24:00)**: `DateComponents.hour` is 0…23 → compiled as
   `00:00` of the boundary day (Apple treats end-of-midnight correctly for
   recurring schedules). Covered by compiler unit tests.
8. **Grace across midnight**: grace activity uses absolute date components
   (year/month/day + time), so a 23:50 + 15 min grace is still a valid one-shot
   schedule.

## Verification done for this spike

- Read the installed lib source (`node_modules/react-native-device-activity@0.6.1`):
  `src/index.ts` (public API), `src/ReactNativeDeviceActivity.types.ts`
  (schedule/event/action types), `ios/ReactNativeDeviceActivityModule.swift`
  (`requestAuthorization` → `AuthorizationCenter`), `config-plugin/*`
  (target copy + entitlements + Info.plist app group), `targets/*`
  (extension templates).
- Confirmed `@kingstinct/expo-apple-targets` reads the **app repo's**
  `targets/*/expo-target.config.js` as the source of truth
  (`withTargetsDir` glob) → in-repo Swift customization is the intended path.
- Web check of `expo-app-blocker` (README/API surface) for the comparison.
