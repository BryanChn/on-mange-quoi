import assert from "node:assert/strict";
import { test } from "node:test";

import { updateBanner, versionLabel } from "./app-version.ts";

const base = { isEmbeddedLaunch: false, isEmergencyLaunch: false };

test("versionLabel : la version de l'APK, sans mise à jour", () => {
  assert.equal(versionLabel({ ...base, isEmbeddedLaunch: true }), "Version de l’APK");
  // Pas de date connue : on ne prétend pas savoir laquelle tourne.
  assert.equal(versionLabel(base), "Version de l’APK");
});

test("versionLabel : une mise à jour, sa date et son identifiant court", () => {
  const createdAt = new Date(2026, 10, 20, 9, 48);
  assert.equal(
    versionLabel({ ...base, createdAt, updateId: "01a1f825-446d-72c2-9d9e-bdefb1666367" }),
    "Mise à jour du 20/11 à 09:48 · 01a1f825",
  );
  assert.equal(versionLabel({ ...base, createdAt }), "Mise à jour du 20/11 à 09:48");
});

test("versionLabel : lancement de secours après un plantage", () => {
  assert.equal(
    versionLabel({ ...base, isEmergencyLaunch: true, createdAt: new Date() }),
    "Version de secours (une mise à jour a planté)",
  );
});

test("updateBanner : rien, téléchargement, puis prête", () => {
  assert.equal(updateBanner({ isDownloading: false, isUpdatePending: false }), null);
  assert.equal(updateBanner({ isDownloading: true, isUpdatePending: false }), "downloading");
  assert.equal(updateBanner({ isDownloading: false, isUpdatePending: true }), "ready");
  assert.equal(updateBanner({ isDownloading: true, isUpdatePending: true }), "ready");
});
