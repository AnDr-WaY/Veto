# Veto — Release Guide

From clean repo to TestFlight / App Store. Read once before the first
release, then use the checklists.

## 0. One-time Apple-side setup

1. **Apple Developer Program** — active membership (Individual or
   Organization). The Screen Time APIs require the **Family Controls
   (Distribution)** entitlement, which needs an organization account.
2. **Team ID** — put it into `.env` (gitignored) as
   `APPLE_TEAM_ID=<your team id>`; `app.config.ts` reads it from the
   environment and it propagates to the plugin's extension targets. For
   EAS cloud builds register it once with
   `eas env:create --name APPLE_TEAM_ID --value <id>`. It is not a secret
   in Apple's terms, but it is kept out of the repo so the open-source
   code ships without account-specific values.
3. **Family Controls (Distribution) entitlement** — request it in the Apple
   Developer account (Identifiers → your App ID → additional capabilities, or
   the request form at
   <https://developer.apple.com/contact/request/family-controls-distribution-entitlement/>).
   Apple reviews it manually — budget 1–2 business days. The development
   entitlement works immediately, so device builds for testing can start
   before the distribution request is approved.
4. **App IDs / App Group** — when EAS manages credentials this is automatic;
   for manual provisioning register:
   - App ID `io.veto.app` with capabilities: Family Controls, App Groups
   - App Group `group.io.veto.app` (shared by the app and all three
     extension targets)
5. **App Store Connect** — create the app record "Veto" with the bundle id
   `io.veto.app`, SKU `veto`.

## 1. Privacy manifest (PrivacyInfo.xcprivacy)

Done — declared in `app.config.ts` under `ios.privacyManifests`; the Expo
prebuild pipeline (`withPrivacyInfo` in `@expo/prebuild-config`) renders it to
`ios/Veto/PrivacyInfo.xcprivacy` and links it into the Xcode project on every
prebuild. No manual file management needed.

What it declares:

- **NSPrivacyCollectedDataTypes** — empty. Veto collects nothing: no
  analytics, no accounts, no network calls to first parties.
- **NSPrivacyTracking** — `false`; **NSPrivacyTrackingDomains** — empty.
- **Required-reason APIs actually used**:
  - `CA92.1` (UserDefaults) — the App Group store (`group.io.veto.app`) and
    library defaults access fall under "access info from the app's own
    container".
- Third-party SDKs (react-native-device-activity, MMKV, Reanimated) ship
  their own privacy manifests; keep them updated on dependency bumps.

## 2. EAS build profiles

`eas.json` defines:

| Profile       | Purpose                              | Notes |
| ------------- | ------------------------------------ | ----- |
| `development` | daily device testing                 | dev client, internal distribution |
| `preview`     | shareable internal build / simulator | iOS simulator artifact |
| `production`  | TestFlight / App Store               | auto-increments build number (`appVersionSource: remote`) |

Builds:

```bash
eas build -p ios --profile development   # dev device build
eas build -p ios --profile preview       # simulator / internal
eas build -p ios --profile production    # TestFlight candidate
```

Credentials: let EAS manage them (`eas credentials` to inspect). Every
extension target must inherit the App Group + Family Controls entitlements —
verify after the first production build: **Builds → the build →
"Entitlements"** must list both on the app *and* the three extensions.

## 3. Pre-flight checklist (per release)

- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green
- [ ] `npx expo-doctor` clean
- [ ] `npx expo prebuild -p ios --no-install` succeeds and `targets/**`
      custom Swift survives (the plugin must not re-copy templates)
- [ ] Device checklist in `README.md` passed on a real iPhone,
      **including criterion C** (picked apps actually block in the window)
- [ ] Version bumped (`app.config.ts` → `version`); build number is managed
      remotely by EAS
- [ ] `ITSAppUsesNonExemptEncryption: false` is set (it is, in
      `app.config.ts`) — no export-compliance prompt per build

## 4. TestFlight

1. `eas build -p ios --profile production` (or `eas submit` right after:
   `eas submit -p ios --latest`).
2. App Store Connect → TestFlight: the build appears after processing
   (10–30 min).
3. First build of a version: answer the encryption question (answer "No" —
   the plist flag usually suppresses it), wait for beta review of the *first*
   build only.
4. Internal testers: add up to 100 App Store Connect users — instant.
5. External testers (up to 10 000): needs the beta app review + a test
   information page.
6. Test on a **fresh install**: onboarding → authorize → first block →
   reboot → blocking survives (the fastest path to find entitlement or
   provisioning regressions).

## 5. App Store submission

- Screenshots: 6.7" (and 6.1") set — Home, create wizard, shield, stats.
  Use the native build (the shield is a real system extension, not a mock).
- Privacy nutrition labels: **No Data Collected** (must match
  `PrivacyInfo.xcprivacy`).
- Review notes for Apple (Screen Time apps get scrutiny):
  - Explain: Veto schedules app blocking via DeviceActivity; the user picks
    the apps and the windows; nothing is uploaded off-device.
  - Family Controls entitlement is already granted to this App ID (mention
    the request ticket).
  - Provide a demo video showing: onboarding → authorize → a picked app
    being shielded inside the window → shield lifting at window end.
- Age rating: 4+. No account, no IAP (the app is fully free by design —
  no paid gates, so no IAP setup is needed).

## 6. Release engineering notes

- `appVersionSource: remote` — EAS is the source of truth for build numbers;
  do not hand-edit `ios/` (generated).
- Rollbacks: native builds are immutable — ship a new patch version; expo
  updates (OTA) are **not** enabled, by design (blocking logic must ship in
  the binary).
- After every dependency bump re-check the plugin template copy behavior
  (`copyToTargetFolder: false` in `app.config.ts`) and the extension
  entitlements.
