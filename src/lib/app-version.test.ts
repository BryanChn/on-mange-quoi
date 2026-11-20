import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isNewlyUpdated,
  shouldReloadOnResume,
  SILENT_RELOAD_AFTER_MS,
  updateBanner,
  versionLabel,
} from "./app-version.ts";

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

test("updateBanner : une seule annonce, la plus utile d'abord", () => {
  const none = { isDownloading: false, isUpdatePending: false, justUpdated: false };
  assert.equal(updateBanner(none), null);
  assert.equal(updateBanner({ ...none, justUpdated: true }), "updated");
  assert.equal(updateBanner({ ...none, isDownloading: true, justUpdated: true }), "downloading");
  assert.equal(
    updateBanner({ isDownloading: true, isUpdatePending: true, justUpdated: true }),
    "ready",
  );
});

test("shouldReloadOnResume : longue absence ET mise à jour déjà téléchargée", () => {
  const long = SILENT_RELOAD_AFTER_MS;
  assert.equal(shouldReloadOnResume({ awayMs: long, isUpdatePending: true }), true);
  assert.equal(shouldReloadOnResume({ awayMs: long * 6, isUpdatePending: true }), true);
  // Absence courte : il reprend où il en était, même avec une mise à jour prête.
  assert.equal(shouldReloadOnResume({ awayMs: long - 1, isUpdatePending: true }), false);
  // Rien de téléchargé : rien à appliquer.
  assert.equal(shouldReloadOnResume({ awayMs: long * 6, isUpdatePending: false }), false);
});

test("isNewlyUpdated : une mise à jour pas encore annoncée, une seule fois", () => {
  const update = { runningUpdateId: "01a1f825", isEmbeddedLaunch: false };
  assert.equal(isNewlyUpdated({ ...update, lastAnnouncedId: null }), true);
  assert.equal(isNewlyUpdated({ ...update, lastAnnouncedId: "01a1f7b0" }), true);
  assert.equal(isNewlyUpdated({ ...update, lastAnnouncedId: "01a1f825" }), false);
  // La version de l'APK ne s'annonce pas.
  assert.equal(
    isNewlyUpdated({ runningUpdateId: null, isEmbeddedLaunch: true, lastAnnouncedId: null }),
    false,
  );
});
