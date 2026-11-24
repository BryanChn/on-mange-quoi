import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSuggestions,
  cleanShoppingInput,
  findDuplicate,
  normalizeLabel,
  shoppingShortcut,
  sortShoppingList,
  type ShoppingItem,
} from "./shopping-rules.ts";

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

test("doublons : majuscules, accents, espaces et « œ » ignorés", () => {
  assert.equal(normalizeLabel("  LAIT   demi-écrémé "), "lait demi-ecreme");
  assert.equal(normalizeLabel("Œufs"), normalizeLabel("oeufs"));
});

test("doublons : trouve l'article déjà là, à acheter ou déjà pris, sauf celui qu'on renomme", () => {
  const lait = item("lait", "2026-11-24T10:00:00Z");
  const pain = { ...item("pain", "2026-11-24T10:01:00Z", "2026-11-24T18:00:00Z"), label: "Pain" };
  const items = [{ ...lait, label: "Lait" }, pain];
  assert.equal(findDuplicate(items, " lait ")?.id, "lait");
  assert.equal(findDuplicate(items, "PAIN")?.id, "pain");
  assert.equal(findDuplicate(items, "Beurre"), null);
  assert.equal(findDuplicate(items, "Lait", "lait"), null);
});

test("suggestions : les plus fréquents d'abord, avec la dernière quantité ; rien de ce qui est déjà là", () => {
  const history = [
    { label: "Pain", quantity: null, clearedAt: "2026-11-10T18:00:00Z" },
    { label: "lait", quantity: "1", clearedAt: "2026-11-10T18:00:00Z" },
    { label: "Lait", quantity: "2", clearedAt: "2026-11-17T18:00:00Z" },
    { label: "Beurre", quantity: null, clearedAt: "2026-11-20T18:00:00Z" },
    { label: "Œufs", quantity: "12", clearedAt: "2026-11-21T18:00:00Z" },
  ];
  const current = [{ ...item("x", "2026-11-24T10:00:00Z"), label: "oeufs" }];
  assert.deepEqual(buildSuggestions(history, current), [
    { label: "Lait", quantity: "2" },
    { label: "Beurre", quantity: null },
    { label: "Pain", quantity: null },
  ]);
  assert.equal(buildSuggestions(history, [], 2).length, 2);
});

test("accueil : une seule ligne de courses, même avec plusieurs foyers", () => {
  const groups = [
    { id: "maison", name: "Maison" },
    { id: "test", name: "Test" },
    { id: "vide", name: "Vide" },
  ];
  assert.deepEqual(shoppingShortcut(groups, new Map()), { kind: "none" });
  assert.deepEqual(
    shoppingShortcut(
      groups,
      new Map([
        ["maison", 6],
        ["vide", 0],
      ]),
    ),
    {
      kind: "one",
      groupId: "maison",
      subtitle: "Maison · 6 à acheter",
    },
  );
  assert.deepEqual(
    shoppingShortcut(
      groups,
      new Map([
        ["maison", 6],
        ["test", 1],
      ]),
    ),
    {
      kind: "many",
      subtitle: "7 à acheter dans 2 groupes",
    },
  );
});
