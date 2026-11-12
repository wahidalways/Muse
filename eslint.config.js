// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Installed agent tooling and local mocks are not Muse code.
    ignores: ['dist/*', '.agents/**', '.github/**', '.impeccable/**', 'artifacts/**'],
  },
]);
