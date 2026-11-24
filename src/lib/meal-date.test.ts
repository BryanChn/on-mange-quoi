import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  formatLongDay,
  formatShortDay,
  isSelectable,
  monthWeeks,
  toDay,
} from "./meal-date.ts";

test("jours au format de la colonne, et passage de mois et d'année", () => {
  assert.equal(toDay(new Date(2026, 11, 24, 20)), "2026-12-24");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-28", 2), "2026-03-30");
});

test("dates lisibles : courte pour l'écran, longue pour le lecteur d'écran", () => {
  assert.equal(formatShortDay("2026-12-24"), "jeu. 24 déc.");
  assert.equal(formatLongDay("2026-12-24"), "jeudi 24 décembre");
});

test("seuls les jours d'aujourd'hui à 6 mois sont proposés", () => {
  assert.equal(isSelectable("2026-11-23", "2026-11-24"), false);
  assert.equal(isSelectable("2026-11-24", "2026-11-24"), true);
  assert.equal(isSelectable(addDays("2026-11-24", 183), "2026-11-24"), true);
  assert.equal(isSelectable(addDays("2026-11-24", 184), "2026-11-24"), false);
});

test("un mois en semaines, du lundi au dimanche", () => {
  // Décembre 2026 commence un mardi : une case vide le lundi.
  const weeks = monthWeeks(2026, 11);
  assert.deepEqual(weeks[0], [
    null,
    "2026-12-01",
    "2026-12-02",
    "2026-12-03",
    "2026-12-04",
    "2026-12-05",
    "2026-12-06",
  ]);
  assert.equal(weeks.at(-1)?.at(3), "2026-12-31");
  assert.ok(weeks.every((week) => week.length === 7));
});
