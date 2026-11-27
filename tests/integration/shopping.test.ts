// Liste de courses d'un foyer (migration shopping_items) sur la base locale : le vrai code de
// src/lib/shopping.ts, RLS et trigger compris.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice et Bea partagent le foyer, Dan n'en fait pas partie.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  addShoppingItem,
  clearCheckedItems,
  fetchAisleSettings,
  fetchShoppingHistory,
  fetchShoppingList,
  removeShoppingItem,
  saveAisleOrder,
  setShoppingItemAisle,
  setShoppingItemChecked,
  setShoppingItemImportant,
  updateShoppingItem,
} from "../../src/lib/shopping.ts";
import { orderedAisles, SHOPPING_AISLES } from "../../src/lib/shopping-rules.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let dan: TestUser;
let foyerId: string;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  dan = await createUser("Dan");
  foyerId = await createGroup(alice, [bea]);
});

after(cleanUp);

// Chaque test part d'une liste vide, pour ne pas dépendre de l'ordre des tests.
async function emptyList(): Promise<void> {
  await signInAs(alice);
  const { error } = await supabase.from("shopping_items").delete().eq("group_id", foyerId);
  if (error) throw error;
}

describe("liste de courses", () => {
  test("un membre ajoute, l'autre la voit, avec qui l'a ajoutée", async () => {
    await emptyList();
    await signInAs(alice);
    await addShoppingItem(foyerId, { label: "  Lait  ", quantity: " 2 " });

    await signInAs(bea);
    const list = await fetchShoppingList(foyerId);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, "Lait");
    assert.equal(list[0].quantity, "2");
    assert.equal(list[0].addedBy, alice.id);
    assert.equal(list[0].checkedAt, null);
  });

  test("hors du foyer : rien à voir, rien à ajouter, rien à cocher", async () => {
    await emptyList();
    await signInAs(alice);
    const lait = await addShoppingItem(foyerId, { label: "Lait", quantity: "" });

    await signInAs(dan);
    assert.deepEqual(await fetchShoppingList(foyerId), []);
    await assert.rejects(addShoppingItem(foyerId, { label: "Intrus", quantity: "" }));
    await assert.rejects(setShoppingItemChecked(lait.id, true));
    await assert.rejects(removeShoppingItem(lait.id));
  });

  test("cocher : l'heure et l'auteur viennent du serveur ; décocher les efface", async () => {
    await emptyList();
    await signInAs(alice);
    const pain = await addShoppingItem(foyerId, { label: "Pain", quantity: "" });

    await signInAs(bea);
    await setShoppingItemChecked(pain.id, true);
    let [item] = await fetchShoppingList(foyerId);
    assert.equal(item.checkedBy, bea.id);
    assert.ok(item.checkedAt);
    const firstCheck = item.checkedAt;

    // Recocher (Alice, qui croit être la première) garde la première heure et Bea.
    await signInAs(alice);
    await setShoppingItemChecked(pain.id, true);
    [item] = await fetchShoppingList(foyerId);
    assert.equal(item.checkedBy, bea.id);
    assert.equal(item.checkedAt, firstCheck);

    await setShoppingItemChecked(pain.id, false);
    [item] = await fetchShoppingList(foyerId);
    assert.equal(item.checkedAt, null);
    assert.equal(item.checkedBy, null);
  });

  test("une date de coche envoyée par l'app est remplacée par l'heure du serveur", async () => {
    await emptyList();
    await signInAs(alice);
    const oeufs = await addShoppingItem(foyerId, { label: "Œufs", quantity: "12" });

    const { error } = await supabase
      .from("shopping_items")
      .update({ checked_at: "2000-01-01T00:00:00Z" })
      .eq("id", oeufs.id);
    assert.equal(error, null);
    const [item] = await fetchShoppingList(foyerId);
    assert.ok(item.checkedAt && item.checkedAt > "2026-01-01");
    assert.equal(item.checkedBy, alice.id);
  });

  test("impossible d'usurper l'auteur ou celui qui a coché (droits par colonne)", async () => {
    await emptyList();
    await signInAs(bea);
    const forgedAuthor = await supabase
      .from("shopping_items")
      .insert({ group_id: foyerId, label: "Faux", added_by: alice.id });
    assert.ok(forgedAuthor.error, "added_by ne doit pas être accepté");

    const beurre = await addShoppingItem(foyerId, { label: "Beurre", quantity: "" });
    const forgedChecker = await supabase
      .from("shopping_items")
      .update({ checked_by: alice.id })
      .eq("id", beurre.id);
    assert.ok(forgedChecker.error, "checked_by ne doit pas être accepté");
  });

  test("« Retirer les achetés » ne retire que les articles cochés", async () => {
    await emptyList();
    await signInAs(alice);
    const lait = await addShoppingItem(foyerId, { label: "Lait", quantity: "" });
    const pain = await addShoppingItem(foyerId, { label: "Pain", quantity: "" });
    await addShoppingItem(foyerId, { label: "Beurre", quantity: "" });
    await setShoppingItemChecked(lait.id, true);
    await setShoppingItemChecked(pain.id, true);

    await signInAs(bea);
    assert.equal(await clearCheckedItems(foyerId), 2);
    const list = await fetchShoppingList(foyerId);
    assert.deepEqual(
      list.map((entry) => entry.label),
      ["Beurre"],
    );
  });

  test("ordre : reste à acheter d'abord, puis ce qui est déjà pris", async () => {
    await emptyList();
    await signInAs(alice);
    const lait = await addShoppingItem(foyerId, { label: "Lait", quantity: "" });
    await addShoppingItem(foyerId, { label: "Pain", quantity: "" });
    await setShoppingItemChecked(lait.id, true);

    const list = await fetchShoppingList(foyerId);
    assert.deepEqual(
      list.map((entry) => entry.label),
      ["Pain", "Lait"],
    );
  });

  test("une soirée n'a pas de liste de courses, même pour son responsable", async () => {
    await signInAs(alice);
    const { data: soiree, error } = await supabase.rpc("create_soiree", {
      soiree_name: "Samedi chez Alice",
    });
    if (error) throw error;
    await assert.rejects(addShoppingItem(soiree.id, { label: "Chips", quantity: "" }));
    assert.deepEqual(await fetchShoppingList(soiree.id), []);
  });

  test("modifier un article : un membre corrige nom et quantité, un intrus ne peut pas", async () => {
    await emptyList();
    await signInAs(alice);
    const lait = await addShoppingItem(foyerId, { label: "Lait", quantity: "2" });

    await signInAs(bea);
    await updateShoppingItem(lait.id, { label: " Lait  entier ", quantity: "3" });
    const [item] = await fetchShoppingList(foyerId);
    assert.equal(item.label, "Lait entier");
    assert.equal(item.quantity, "3");
    assert.equal(item.addedBy, alice.id);

    await signInAs(dan);
    await assert.rejects(updateShoppingItem(lait.id, { label: "Piraté", quantity: "" }));
  });

  test("« Retirer les achetés » range : hors de la liste, dans l'historique, heure du serveur", async () => {
    await emptyList();
    await signInAs(alice);
    const lait = await addShoppingItem(foyerId, { label: "Lait", quantity: "2" });
    await addShoppingItem(foyerId, { label: "Pain", quantity: "" });
    await setShoppingItemChecked(lait.id, true);
    assert.equal(await clearCheckedItems(foyerId), 1);

    assert.deepEqual(
      (await fetchShoppingList(foyerId)).map((entry) => entry.label),
      ["Pain"],
    );
    const history = await fetchShoppingHistory(foyerId);
    assert.equal(history.length, 1);
    assert.equal(history[0].label, "Lait");
    assert.equal(history[0].quantity, "2");
    assert.ok(history[0].clearedAt > "2026-01-01");

    // Ranger une deuxième fois ne déplace rien (déjà rangé).
    assert.equal(await clearCheckedItems(foyerId), 0);

    // Un intrus ne voit pas l'historique du foyer.
    await signInAs(dan);
    assert.deepEqual(await fetchShoppingHistory(foyerId), []);
  });

  test("un article non coché ne peut pas être rangé", async () => {
    await emptyList();
    await signInAs(alice);
    const beurre = await addShoppingItem(foyerId, { label: "Beurre", quantity: "" });
    const { error } = await supabase
      .from("shopping_items")
      .update({ cleared_at: new Date().toISOString() })
      .eq("id", beurre.id);
    assert.ok(error, "la contrainte doit refuser de ranger un article non pris");
  });

  test("un article vide est refusé par la base", async () => {
    await signInAs(alice);
    await assert.rejects(addShoppingItem(foyerId, { label: "   ", quantity: "" }));
  });
});

describe("les rayons", () => {
  test("le rayon est deviné à l'ajout ; changé par Bea, le foyer s'en souvient pour ce nom", async () => {
    await emptyList();
    await signInAs(alice);
    const lait = await addShoppingItem(foyerId, { label: "Lait", quantity: "" });
    assert.equal(lait.aisle, "cremerie");
    const bougies = await addShoppingItem(foyerId, { label: "Ballons", quantity: "" });
    assert.equal(bougies.aisle, "autres");

    await signInAs(bea);
    await setShoppingItemAisle(bougies, "maison_hygiene");
    const list = await fetchShoppingList(foyerId);
    assert.equal(list.find((item) => item.id === bougies.id)?.aisle, "maison_hygiene");

    // Le prochain « ballons » (casse et espaces différents) va directement au bon rayon.
    await signInAs(alice);
    const { chosen } = await fetchAisleSettings(foyerId);
    await removeShoppingItem(bougies.id);
    const again = await addShoppingItem(foyerId, { label: "  BALLONS ", quantity: "" }, chosen);
    assert.equal(again.aisle, "maison_hygiene");
  });

  test("Dan, hors du foyer, ne range rien et ne lit pas les choix", async () => {
    await emptyList();
    await signInAs(alice);
    const pain = await addShoppingItem(foyerId, { label: "Pain", quantity: "" });

    await signInAs(dan);
    await assert.rejects(setShoppingItemAisle(pain, "autres"));
    await assert.rejects(saveAisleOrder(foyerId, SHOPPING_AISLES));
    const { data } = await supabase
      .from("shopping_aisle_choices")
      .select("label_key")
      .eq("group_id", foyerId);
    assert.deepEqual(data, []);
    // Le rayon ne change que par set_shopping_item_aisle (le choix est retenu au passage).
    await signInAs(alice);
    const direct = await supabase
      .from("shopping_items")
      .update({ aisle: "autres" })
      .eq("id", pain.id);
    assert.ok(direct.error, "update direct du rayon refusé");
  });

  test("l'ordre des rayons du foyer : enregistré pour tous, un ordre incomplet refusé", async () => {
    await signInAs(alice);
    const order = orderedAisles(["boissons", "cremerie"]);
    await saveAisleOrder(foyerId, order);

    await signInAs(bea);
    assert.deepEqual((await fetchAisleSettings(foyerId)).order, order);
    // Un rayon en double, ou « autres » ailleurs qu'à la fin : refusé.
    await assert.rejects(saveAisleOrder(foyerId, ["boissons", "boissons", ...order.slice(2)]));
    await assert.rejects(saveAisleOrder(foyerId, ["autres", ...order.slice(0, -1)]));
  });

  test("l'étoile « indispensable », posée par Alice, vue par Bea", async () => {
    await emptyList();
    await signInAs(alice);
    const couches = await addShoppingItem(foyerId, { label: "Couches", quantity: "" });
    assert.equal(couches.isImportant, false);
    await setShoppingItemImportant(couches.id, true);

    await signInAs(bea);
    const list = await fetchShoppingList(foyerId);
    assert.equal(list.find((item) => item.id === couches.id)?.isImportant, true);
  });
});
