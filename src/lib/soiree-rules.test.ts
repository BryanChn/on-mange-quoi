import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultSoireeName, SOIREE_NAME_MAX_LENGTH, toJoinFailure } from "./soiree-rules.ts";

test("le nom proposé est le jour d'aujourd'hui chez le prénom", () => {
  // 28 novembre 2026 : un samedi.
  assert.equal(defaultSoireeName(new Date(2026, 10, 28, 19), "Bryan"), "Samedi chez Bryan");
  assert.equal(defaultSoireeName(new Date(2026, 10, 23, 12), "  Léa "), "Lundi chez Léa");
});

test("sans prénom, un nom neutre ; un prénom trop long est coupé à la limite de la colonne", () => {
  assert.equal(defaultSoireeName(new Date(2026, 10, 28), " "), "Soirée de samedi");
  const long = defaultSoireeName(new Date(2026, 10, 28), "A".repeat(60));
  assert.equal(long.length, SOIREE_NAME_MAX_LENGTH);
});

test("les erreurs de join_soiree sont reconnues par leur hint, les autres non", () => {
  assert.equal(toJoinFailure({ code: "55000", hint: "soiree_full" }), "soiree_full");
  assert.equal(toJoinFailure({ code: "P0002", hint: "invalid_link" }), "invalid_link");
  assert.equal(toJoinFailure({ code: "55000", hint: "session_closed" }), null);
  assert.equal(toJoinFailure(new Error("réseau")), null);
  assert.equal(toJoinFailure(null), null);
});
