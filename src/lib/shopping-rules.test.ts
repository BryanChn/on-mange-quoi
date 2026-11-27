import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSuggestions,
  cleanShoppingInput,
  clockLabel,
  findDuplicate,
  groupShoppingItems,
  guessAisle,
  moveAisle,
  orderedAisles,
  SHOPPING_AISLES,
  normalizeLabel,
  planShoppingAdditions,
  sortShoppingList,
  splitShoppingList,
  tripToShow,
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
    aisle: "autres",
    isImportant: false,
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

test("liste : un article tout juste coché reste à sa place, puis rejoint « Déjà pris »", () => {
  const items = [
    item("lait", "2026-11-24T10:01:00Z"),
    // Coché à l'instant, mais encore retenu dans « À acheter ».
    item("beurre", "2026-11-24T10:02:00Z", "2026-11-24T18:10:00Z"),
    item("pain", "2026-11-24T10:03:00Z"),
    item("oeufs", "2026-11-24T10:00:00Z", "2026-11-24T18:05:00Z"),
  ];
  const held = splitShoppingList(items, new Map([["beurre", "toBuy"]]));
  assert.deepEqual(
    held.toBuy.map((entry) => entry.id),
    ["lait", "beurre", "pain"],
  );
  assert.deepEqual(
    held.taken.map((entry) => entry.id),
    ["oeufs"],
  );

  // Plus rien de retenu : il glisse en tête de « Déjà pris » (le dernier pris).
  const settled = splitShoppingList(items, new Map());
  assert.deepEqual(
    settled.toBuy.map((entry) => entry.id),
    ["lait", "pain"],
  );
  assert.deepEqual(
    settled.taken.map((entry) => entry.id),
    ["beurre", "oeufs"],
  );
});

test("liste : des articles ajoutés au même instant gardent leur ordre quand on en coche un", () => {
  const sameTime = "2026-11-24T10:00:00Z";
  const before = splitShoppingList(
    [item("c", sameTime), item("a", sameTime), item("b", sameTime)],
    new Map(),
  );
  const held = splitShoppingList(
    [item("c", sameTime), item("a", sameTime, "2026-11-24T18:00:00Z"), item("b", sameTime)],
    new Map([["a", "toBuy"]]),
  );
  assert.deepEqual(
    held.toBuy.map((entry) => entry.id),
    before.toBuy.map((entry) => entry.id),
  );
});

test("liste : un article décoché reste un instant en bas de « Déjà pris »", () => {
  const items = [
    item("lait", "2026-11-24T10:01:00Z"),
    item("oeufs", "2026-11-24T10:00:00Z", "2026-11-24T18:05:00Z"),
  ];
  const held = splitShoppingList(items, new Map([["lait", "taken"]]));
  assert.deepEqual(
    held.taken.map((entry) => entry.id),
    ["oeufs", "lait"],
  );
  assert.equal(held.toBuy.length, 0);
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

test("clockLabel : « 19 h 40 », « 9 h 05 »", () => {
  assert.equal(clockLabel(new Date(2026, 10, 25, 19, 40)), "19 h 40");
  assert.equal(clockLabel(new Date(2026, 10, 25, 9, 5)), "9 h 05");
});

test("tripToShow : le mien d'abord, sinon le plus récent des autres, sinon rien", () => {
  const lea = { shopperId: "lea", endsAt: "2026-11-25T19:40:00Z" };
  const me = { shopperId: "me", endsAt: "2026-11-25T19:00:00Z" };
  assert.deepEqual(tripToShow([lea, me], "me"), { trip: me, isMine: true });
  assert.deepEqual(tripToShow([lea], "me"), { trip: lea, isMine: false });
  assert.equal(tripToShow([], "me"), null);
});

test("ajouter une recette aux courses : sans doublon, ce qui est pris revient", () => {
  const item = (id: string, label: string, checkedAt: string | null = null): ShoppingItem => ({
    id,
    label,
    quantity: null,
    addedBy: null,
    checkedAt,
    checkedBy: null,
    aisle: "autres",
    isImportant: false,
    createdAt: "2026-11-26T10:00:00Z",
  });
  const plan = planShoppingAdditions(
    [
      { label: "Plat de côte", quantity: "350 g" },
      { label: "Carottes", quantity: "2" },
      { label: "carottes", quantity: "1" },
      { label: "Bouquet garni", quantity: "1" },
      { label: "Poireaux", quantity: "1" },
      { label: "  ", quantity: null },
    ],
    [item("a", "Bouquet garni"), item("b", "Poireaux", "2026-11-25T18:00:00Z")],
  );
  assert.deepEqual(plan, {
    toInsert: [
      { label: "Plat de côte", quantity: "350 g" },
      { label: "Carottes", quantity: "2" },
    ],
    toUncheck: ["b"],
    alreadyToBuy: ["Bouquet garni"],
  });
});

test("rayon deviné d'après le nom, mots et expressions", () => {
  const cases: [string, string][] = [
    ["Tomates cerises", "fruits_legumes"],
    ["Pommes de terre", "fruits_legumes"],
    ["Laitue", "fruits_legumes"],
    ["Lait demi-écrémé", "cremerie"],
    ["Œufs", "cremerie"],
    ["Lait de coco", "epicerie_salee"],
    ["Pâtes", "epicerie_salee"],
    ["Pâte à tartiner", "epicerie_sucree"],
    ["Gâteau", "epicerie_sucree"],
    ["Eau gazeuse", "boissons"],
    ["Baguette", "boulangerie"],
    ["Couches", "bebe"],
    ["Croquettes", "animaux"],
    ["Papier toilette", "maison_hygiene"],
    ["Escalopes de dinde", "boucherie_poisson"],
    ["Pizza maison", "autres"],
    ["Bougies d'anniversaire", "maison_hygiene"],
    ["Truc introuvable", "autres"],
  ];
  for (const [label, aisle] of cases) assert.equal(guessAisle(label), aisle, label);
});

test("rayon : le choix du foyer passe avant la devinette", () => {
  const chosen = new Map([["lait de coco", "cremerie" as const]]);
  assert.equal(guessAisle("  Lait de COCO ", chosen), "cremerie");
  assert.equal(guessAisle("Lait", chosen), "cremerie");
});

test("ordre des rayons : complété, « autres » toujours en dernier", () => {
  assert.deepEqual(orderedAisles(null), SHOPPING_AISLES);
  const saved = orderedAisles(["boissons", "autres", "cremerie"]);
  assert.equal(saved[0], "boissons");
  assert.equal(saved[1], "cremerie");
  assert.equal(saved.at(-1), "autres");
  assert.equal(new Set(saved).size, SHOPPING_AISLES.length);

  const order = orderedAisles(null);
  assert.equal(moveAisle(order, "boulangerie", -1)[0], "boulangerie");
  assert.deepEqual(moveAisle(order, "fruits_legumes", -1), order);
  // L'avant-dernier ne passe pas après « autres », et « autres » ne bouge pas.
  assert.deepEqual(moveAisle(order, "maison_hygiene", 1), order);
  assert.deepEqual(moveAisle(order, "autres", -1), order);
});

test("sections : indispensables en tête, puis les rayons dans l'ordre, sans section vide", () => {
  const items = [
    { id: "lait", aisle: "cremerie" as const, isImportant: false },
    { id: "pain", aisle: "boulangerie" as const, isImportant: false },
    { id: "couches", aisle: "bebe" as const, isImportant: true },
    { id: "beurre", aisle: "cremerie" as const, isImportant: false },
  ];
  const byAisle = groupShoppingItems(items, orderedAisles(null), "aisle");
  assert.deepEqual(
    byAisle.map((group) => [group.key, group.items.map((item) => item.id)]),
    [
      ["important", ["couches"]],
      ["boulangerie", ["pain"]],
      ["cremerie", ["lait", "beurre"]],
    ],
  );
  const byAdded = groupShoppingItems(items, orderedAisles(null), "added");
  assert.deepEqual(
    byAdded.map((group) => group.key),
    ["important", "all"],
  );
});
