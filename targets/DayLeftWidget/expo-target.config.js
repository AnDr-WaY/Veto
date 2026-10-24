// Home-screen widget target (WidgetKit). Unlike the DeviceActivity trio,
// this one is configured by hand: the lib's createConfig factory only knows
// 'device-activity-monitor' | 'shield-action' | 'shield-configuration', so
// the App Group is resolved here the same way (from the Expo config).
const getAppGroupFromExpoConfig = require(
  "react-native-device-activity/config-plugin/getAppGroupFromExpoConfig"
);

module.exports = (config) => ({
  type: "widget",
  name: "DayLeftWidget",
  // Keep every Veto extension on the same floor (see 08725d8).
  deploymentTarget: "16.0",
  entitlements: {
    "com.apple.security.application-groups": [getAppGroupFromExpoConfig(config)],
  },
});
