const {
  createConfig,
} = require("react-native-device-activity/config-plugin/createExpoTargetConfig");

// createConfig returns a function of the Expo config (it resolves the App
// Group from it), so wrap instead of spreading the raw export.
module.exports = (config) => ({
  ...createConfig("shield-configuration")(config),
  deploymentTarget: "16.0",
});
