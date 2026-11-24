// Texte libre propre à l'écriture (migration tidy_free_text) sur la base locale : un seul
// espace entre les mots, rien aux bords, quel que soit le client qui écrit.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { addProposal, startSession } from "../../src/lib/votes.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;

before(async () => {
  alice = await createUser("Alice");
});

after(cleanUp);

test("le nom d'un repas est rangé : « Noël  à  Soultz » devient « Noël à Soultz »", async () => {
  await signInAs(alice);
  const { data, error } = await supabase.rpc("create_soiree", {
    soiree_name: "  Noël  à \t Soultz ",
    meal_mode: "maison",
    vote_topics: [],
  });
  if (error) throw error;
  assert.equal(data.name, "Noël à Soultz");
});

test("« Pizza  Roma » est le même plat que « Pizza Roma » : pas de doublon", async () => {
  const groupId = await createGroup(alice, []);
  const sessionId = await startSession(groupId);
  assert.equal(await addProposal(sessionId, "Pizza Roma"), true);
  assert.equal(await addProposal(sessionId, "Pizza  Roma"), false);
  assert.equal(await addProposal(sessionId, " pizza   roma "), false);
});

test("« qui apporte quoi » et les courses sont rangés aussi", async () => {
  await signInAs(alice);
  const { data: meal, error } = await supabase.rpc("create_soiree", {
    soiree_name: "Apéro",
    meal_mode: "maison",
    vote_topics: [],
  });
  if (error) throw error;
  const { data: line, error: lineError } = await supabase
    .from("soiree_contributions")
    .insert({ group_id: meal.id, label: "Le   vin  rouge " })
    .select("label")
    .single();
  if (lineError) throw lineError;
  assert.equal(line.label, "Le vin rouge");

  const groupId = await createGroup(alice, []);
  const { data: item, error: itemError } = await supabase
    .from("shopping_items")
    .insert({ group_id: groupId, label: "Lait  demi-écrémé", quantity: " 2  l " })
    .select("label, quantity")
    .single();
  if (itemError) throw itemError;
  assert.deepEqual(item, { label: "Lait demi-écrémé", quantity: "2 l" });
});
