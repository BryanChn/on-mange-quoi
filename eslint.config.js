// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
// En dernier : coupe les règles de mise en forme d'ESLint, laissées à Prettier.
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    // Points d'entrée Deno (imports npm:, global Deno) : hors de la config Expo.
    ignores: ["dist/*", "example/*", "supabase/functions/*/index.ts"],
  },
]);
