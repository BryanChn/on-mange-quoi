// Midi ou soir (migration vote_moment) sur la base locale : le moment choisi au lancement est
// gardé, un lancement sans moment (app pas à jour) en reçoit un, un repas n'en a jamais.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createSoiree } from "../../src/lib/soirees.ts";
import { fetchSession, startSession } from "../../src/lib/votes.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
});

after(cleanUp);

describe("le moment d'un vote", () => {
  test("un foyer garde le moment choisi au lancement", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const sessionId = await startSession(foyerId, "midi");
    assert.equal((await fetchSession(sessionId)).moment, "midi");
  });

  test("sans moment (une app pas à jour), le serveur en pose un", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const sessionId = await startSession(foyerId);
    const { moment } = await fetchSession(sessionId);
    assert.ok(moment === "midi" || moment === "soir");
  });

  test("un repas à plusieurs n'a jamais de moment, même envoyé", async () => {
    await signInAs(alice);
    const meal = await createSoiree({ name: "Kebab", mode: "commande", topics: [], date: null });
    const { data, error } = await supabase
      .from("vote_sessions")
      .insert({ group_id: meal.id, organizer_id: alice.id, moment: "soir" })
      .select("moment")
      .single();
    assert.equal(error, null);
    assert.equal(data?.moment, null);
  });
});
