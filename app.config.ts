import type { ExpoConfig } from 'expo/config';

/**
 * Expo config for Veto — schedule-based app blocking for iOS.
 *
 * Demo mode: EXPO_PUBLIC_ENGINE=mock runs the full UI without the
 * Family Controls entitlement (used for CI, previews and simulators).
 */

// Real value lives in .env (gitignored) so the repo can be published
// as-is; .env.example documents the variable. EAS builds: `eas env:create`.
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? 'TODO_APPLE_TEAM_ID';

const config: ExpoConfig = {
  owner: 'andrway-veto',
  name: 'Veto',
  slug: 'veto',
  scheme: 'veto',
  version: '1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // OTA JS updates via EAS Update (channels configured in eas.json). Native
  // code — blocking logic, widgets, extensions — always ships in the binary.
  updates: {
    url: 'https://u.expo.dev/7c3d93f5-fed9-45e2-acf9-3749b65fd691',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  ios: {
    bundleIdentifier: 'io.veto.app',
    supportsTablet: false,
    appleTeamId: APPLE_TEAM_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Lock-screen Live Activity (BlockingActivityWidget, DayLeftWidget
      // target); started by the local modules/veto-live-activity module.
      NSSupportsLiveActivities: true,
      // expo-dev-client writes a dev-launcher-specific string on every
      // prebuild; the config-level value is applied last, so this override
      // keeps a review-safe purpose string in shipped builds. The key only
      // matters if the dev launcher ever probes the network at runtime.
      NSLocalNetworkUsageDescription:
        'Veto uses the local network only in developer builds, to connect to a development server on your computer. The released app does not use the local network.',
    },
    // App-level privacy manifest (App Store required-reason APIs).
    // Veto collects nothing and tracks nothing; the App Group UserDefaults
    // (group.io.veto.app) is the only required-reason API surface (CA92.1).
    // Rendered into ios/Veto/PrivacyInfo.xcprivacy by @expo/prebuild-config.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
    entitlements: {
      'com.apple.security.application-groups': ['group.io.veto.app'],
      'com.apple.developer.family-controls': true,
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0A0A0A',
      },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.4',
        },
      },
    ],
    [
      'react-native-device-activity',
      {
        appleTeamId: APPLE_TEAM_ID,
        appGroup: 'group.io.veto.app',
        // targets/ in the repo is the source of truth (custom Veto shield);
        // without this the plugin re-copies its templates over it on every
        // prebuild (see docs/spike-blocking.md, "Risks", 1).
        copyToTargetFolder: false,
      },
    ],
  ],
  extra: {
    engine: process.env.EXPO_PUBLIC_ENGINE ?? 'mock',
    eas: {
      projectId: '7c3d93f5-fed9-45e2-acf9-3749b65fd691'
    },
  },
};

export default config;
