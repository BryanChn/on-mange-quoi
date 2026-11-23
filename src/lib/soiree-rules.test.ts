import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultSoireeName,
  namesWithoutOrder,
  orderText,
  SOIREE_NAME_MAX_LENGTH,
  summarizeOrder,
  toJoinFailure,
} from "./soiree-rules.ts";

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

const names: Record<string, string> = { a: "Alice", t: "Tom", i: "Inès" };
const nameOf = (id: string) => names[id] ?? "?";

test("récap : les lignes identiques s'additionnent, majuscules et espaces ignorés", () => {
  const lines = summarizeOrder(
    [
      { profileId: "a", label: "Kebab sauce blanche", quantity: 1, note: null },
      { profileId: "t", label: "kebab  Sauce blanche ", quantity: 2, note: "" },
      { profileId: "i", label: "Tacos XL", quantity: 1, note: null },
    ],
    nameOf,
  );
  assert.deepEqual(lines, [
    { label: "Kebab sauce blanche", note: null, quantity: 3, people: ["Alice", "Tom ×2"] },
    { label: "Tacos XL", note: null, quantity: 1, people: ["Inès"] },
  ]);
});

test("récap : une remarque différente fait une ligne à part", () => {
  const lines = summarizeOrder(
    [
      { profileId: "a", label: "Kebab", quantity: 1, note: null },
      { profileId: "i", label: "Kebab", quantity: 1, note: " sans  oignon" },
      { profileId: "t", label: "kebab", quantity: 1, note: "Sans oignon" },
    ],
    nameOf,
  );
  assert.deepEqual(lines, [
    { label: "Kebab", note: "sans oignon", quantity: 2, people: ["Inès", "Tom"] },
    { label: "Kebab", note: null, quantity: 1, people: ["Alice"] },
  ]);
});

test("récap en texte, à coller ou à lire au comptoir", () => {
  const text = orderText("Kebab du coin", [
    { label: "Kebab", note: null, quantity: 3, people: [] },
    { label: "Tacos XL", note: "sans oignon", quantity: 1, people: [] },
  ]);
  assert.equal(text, "Kebab du coin · 4 articles\n3× Kebab\n1× Tacos XL (sans oignon)");
  assert.equal(orderText(null, []), "Commande · 0 article");
});

test("qui n'a encore rien commandé", () => {
  const members = [
    { id: "a", name: "Alice" },
    { id: "t", name: "Tom" },
    { id: "i", name: "Inès" },
  ];
  assert.deepEqual(
    namesWithoutOrder(members, [{ profileId: "t", label: "Tacos", quantity: 1, note: null }]),
    ["Alice", "Inès"],
  );
});
