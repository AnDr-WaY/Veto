const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // jest.setup.js runs inside Jest, so the `jest` global is defined there
    // even though the filename doesn't match the *.test.* pattern expoConfig
    // enables the jest environment for.
    files: ['jest.setup.js'],
    languageOptions: {
      globals: { jest: 'readonly' },
    },
  },
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'ios/*',
 'android/*',
      'coverage/*',
      // generated locally, never committed (App Store marketing assets)
      'store-assets/*',
    ],
  },
]);
