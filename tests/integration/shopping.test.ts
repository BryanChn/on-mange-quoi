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
  fetchShoppingList,
  removeShoppingItem,
  setShoppingItemChecked,
  updateShoppingItem,
} from "../../src/lib/shopping.ts";
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

  test("un article vide est refusé par la base", async () => {
    await signInAs(alice);
    await assert.rejects(addShoppingItem(foyerId, { label: "   ", quantity: "" }));
  });
});
