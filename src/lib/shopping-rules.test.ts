import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanShoppingInput, sortShoppingList, type ShoppingItem } from "./shopping-rules.ts";

function item(id: string, createdAt: string, checkedAt: string | null = null): ShoppingItem {
  return {
    id,
    label: id,
    quantity: null,
    addedBy: null,
    checkedAt,
    checkedBy: null,
    createdAt,
  };
}

test("liste : ce qui reste à acheter d'abord (ordre d'ajout), puis le dernier pris en tête", () => {
  const sorted = sortShoppingList([
    item("pain", "2026-11-24T10:02:00Z", "2026-11-24T18:01:00Z"),
    item("lait", "2026-11-24T10:01:00Z"),
    item("oeufs", "2026-11-24T10:00:00Z", "2026-11-24T18:05:00Z"),
    item("beurre", "2026-11-24T10:03:00Z"),
  ]);
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ["lait", "beurre", "oeufs", "pain"],
  );
});

test("liste vide : rien à trier", () => {
  assert.deepEqual(sortShoppingList([]), []);
});

test("saisie : espaces superflus retirés, quantité vide = null", () => {
  assert.deepEqual(cleanShoppingInput("  Lait   demi-écrémé ", " 2  "), {
    label: "Lait demi-écrémé",
    quantity: "2",
  });
  assert.deepEqual(cleanShoppingInput("Pain", "   "), { label: "Pain", quantity: null });
});
