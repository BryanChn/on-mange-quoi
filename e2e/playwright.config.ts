import { defineConfig } from "@playwright/test";

export const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

// Un seul worker : les tests partagent la base locale et créent de vrais comptes.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // L'app exportée par run.sh, servie comme en production.
  webServer: {
    command: `node server.mjs dist-web ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
