// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
// En dernier : coupe les règles de mise en forme d'ESLint, laissées à Prettier.
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    // Code Deno (imports npm:, global Deno) : hors de la config Expo. La logique pure
    // de supabase/functions reste lintée et testée.
    ignores: [
      "dist/*",
      // Paquet à part (e2e/package.json), vérifié par son propre tsconfig.
      "e2e/*",
      "example/*",
      "supabase/functions/*/index.ts",
      "supabase/functions/_shared/server.ts",
    ],
  },
]);
