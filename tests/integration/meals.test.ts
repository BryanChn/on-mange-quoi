// Repas à plusieurs, trois façons (migration meal_modes) sur la base locale : type et date
// d'un repas, sujet des votes, votes du menu en parallèle, « qui apporte quoi », effacement.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice crée les repas, Bea les rejoint avec son compte, Dan n'y entre jamais.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { addProposal, closeSession, setVote, startSession } from "../../src/lib/votes.ts";
import {
  cleanUp,
  createGroup,
  createUser,
  groupExists,
  purgeSoirees,
  sendVoteReminders,
  setSessionCreatedAt,
  setSoireeDates,
  signInAs,
  signInAsNewGuest,
  type TestUser,
} from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let dan: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  dan = await createUser("Dan");
});

after(cleanUp);

const HOUR = 60 * 60 * 1000;
type Topic = "plat" | "resto" | "apero" | "entree" | "dessert";
type Meal = { id: string; joinToken: string; step: string; mode: string; mealDate: string };

// Repas créé par Alice, comme le fera l'écran de création.
async function newMeal(
  mode: "commande" | "resto" | "maison",
  topics: Topic[] = [],
  onDate?: string,
): Promise<Meal> {
  await signInAs(alice);
  const { data, error } = await supabase.rpc("create_soiree", {
    soiree_name: "Noël à Soultz",
    meal_mode: mode,
    vote_topics: topics,
    ...(onDate ? { on_date: onDate } : {}),
  });
  if (error) throw error;
  return {
    id: data.id,
    joinToken: data.join_token ?? "",
    step: data.soiree_step ?? "",
    mode: data.soiree_mode ?? "",
    mealDate: data.meal_date ?? "",
  };
}

async function openSessions(groupId: string): Promise<{ id: string; topic: Topic }[]> {
  const { data, error } = await supabase
    .from("vote_sessions")
    .select("id, topic")
    .eq("group_id", groupId)
    .eq("status", "open")
    .order("topic");
  if (error) throw error;
  return data;
}

async function mealState(groupId: string): Promise<{ step: string; restaurant: string | null }> {
  const { data, error } = await supabase
    .from("groups")
    .select("soiree_step, restaurant")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  return { step: data.soiree_step ?? "", restaurant: data.restaurant };
}

// Un gagnant pour le vote : une proposition, une voix, puis la clôture (par Alice).
async function decide(sessionId: string, winner: string): Promise<void> {
  await signInAs(alice);
  await addProposal(sessionId, winner);
  const { data } = await supabase
    .from("proposals")
    .select("id")
    .eq("session_id", sessionId)
    .eq("name", winner)
    .single();
  await setVote(data!.id, true);
  await closeSession(sessionId);
}

function parisDate(offsetDays: number): string {
  const now = new Date(Date.now() + offsetDays * 24 * HOUR);
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

describe("trois façons de faire un repas", () => {
  test("sans précision : un repas « commande » pour aujourd'hui, comme avant", async () => {
    const meal = await newMeal("commande");
    assert.equal(meal.mode, "commande");
    assert.equal(meal.step, "choix");
    assert.equal(meal.mealDate, parisDate(0));
    assert.deepEqual(await openSessions(meal.id), []);

    // Le vote lancé depuis l'app a pour sujet le resto (posé par le serveur).
    const sessionId = await startSession(meal.id);
    assert.deepEqual(await openSessions(meal.id), [{ id: sessionId, topic: "resto" }]);
  });

  test("« On va au resto » : le vote du resto s'ouvre tout seul ; le gagnant, et c'est décidé", async () => {
    const meal = await newMeal("resto");
    const [session] = await openSessions(meal.id);
    assert.equal(session.topic, "resto");

    await decide(session.id, "Chez Momo");
    assert.deepEqual(await mealState(meal.id), { step: "decide", restaurant: "Chez Momo" });
  });

  test("« Chez quelqu'un » : un vote par sujet, ouverts en même temps, décidé au dernier", async () => {
    const meal = await newMeal("maison", ["dessert", "plat", "dessert"]);
    const sessions = await openSessions(meal.id);
    assert.deepEqual(
      sessions.map((session) => session.topic),
      ["plat", "dessert"],
    );

    const plat = sessions.find((session) => session.topic === "plat")!;
    const dessert = sessions.find((session) => session.topic === "dessert")!;
    await decide(plat.id, "Lasagnes");
    assert.deepEqual(await mealState(meal.id), { step: "choix", restaurant: null });

    await decide(dessert.id, "Tiramisu");
    assert.deepEqual(await mealState(meal.id), { step: "decide", restaurant: null });
  });

  test("« Chez quelqu'un » sans sujet : déjà décidé, il reste qui apporte quoi", async () => {
    const meal = await newMeal("maison", []);
    assert.equal(meal.step, "decide");
    assert.deepEqual(await openSessions(meal.id), []);
  });

  test("le menu d'un repas « maison » ne s'ouvre pas depuis l'app, ni de resto à choisir", async () => {
    const meal = await newMeal("maison", ["plat"]);
    await assert.rejects(startSession(meal.id));
    const { error } = await supabase.rpc("choose_restaurant", {
      target_group_id: meal.id,
      restaurant_name: "Chez Momo",
    });
    assert.equal(error?.hint, "mode_mismatch");
  });

  test("pas de resto à voter chez quelqu'un, pas de repas dans le passé ni dans plus de 6 mois", async () => {
    await signInAs(alice);
    const resto = await supabase.rpc("create_soiree", {
      soiree_name: "Chez Maman",
      meal_mode: "maison",
      vote_topics: ["resto"],
    });
    assert.equal(resto.error?.hint, "invalid_topic");

    for (const onDate of [parisDate(-1), parisDate(200)]) {
      const { error } = await supabase.rpc("create_soiree", {
        soiree_name: "Trop tôt ou trop tard",
        on_date: onDate,
      });
      assert.equal(error?.hint, "invalid_date", onDate);
    }
  });

  test("un foyer vote toujours des plats", async () => {
    const foyerId = await createGroup(alice, []);
    await signInAs(alice);
    const sessionId = await startSession(foyerId);
    assert.deepEqual(await openSessions(foyerId), [{ id: sessionId, topic: "plat" }]);
  });
});

describe("qui apporte quoi", () => {
  async function bring(groupId: string, label: string) {
    return supabase
      .from("soiree_contributions")
      .insert({ group_id: groupId, label })
      .select("id, profile_id")
      .single();
  }

  test("chacun dit ce qu'il apporte, tout le monde le voit, un intrus non", async () => {
    const meal = await newMeal("maison", ["plat"]);
    await signInAs(bea);
    await supabase.rpc("join_soiree", { token: meal.joinToken });
    const beaLine = await bring(meal.id, "Le vin");
    assert.equal(beaLine.error, null);
    assert.equal(beaLine.data?.profile_id, bea.id);

    await signInAs(alice);
    const { data: seen } = await supabase
      .from("soiree_contributions")
      .select("label")
      .eq("group_id", meal.id);
    assert.deepEqual(seen, [{ label: "Le vin" }]);

    await signInAs(dan);
    const { data: hidden } = await supabase
      .from("soiree_contributions")
      .select("label")
      .eq("group_id", meal.id);
    assert.deepEqual(hidden, []);
    assert.ok((await bring(meal.id, "Intrus")).error);
  });

  test("un invité sans compte apporte aussi ; personne ne modifie la ligne d'un autre", async () => {
    const meal = await newMeal("maison", []);
    await signInAsNewGuest();
    const { error: joinError } = await supabase.rpc("join_soiree", {
      token: meal.joinToken,
      guest_name: "Tom",
    });
    assert.equal(joinError, null);
    const tomLine = await bring(meal.id, "Les chips");
    assert.equal(tomLine.error, null);

    // Bea (membre) ne peut ni modifier ni retirer la ligne de Tom…
    await signInAs(bea);
    await supabase.rpc("join_soiree", { token: meal.joinToken });
    const { data: edited } = await supabase
      .from("soiree_contributions")
      .update({ label: "Rien" })
      .eq("id", tomLine.data!.id)
      .select("id");
    assert.deepEqual(edited, []);
    const { data: removedByBea } = await supabase
      .from("soiree_contributions")
      .delete()
      .eq("id", tomLine.data!.id)
      .select("id");
    assert.deepEqual(removedByBea, []);

    // …la responsable, si.
    await signInAs(alice);
    const { data: removedByAlice } = await supabase
      .from("soiree_contributions")
      .delete()
      .eq("id", tomLine.data!.id)
      .select("id");
    assert.equal(removedByAlice?.length, 1);
  });

  test("pas de « qui apporte quoi » dans un repas « commande » ; l'auteur vient du serveur", async () => {
    const meal = await newMeal("commande");
    assert.ok((await bring(meal.id, "Le vin")).error);

    const home = await newMeal("maison", []);
    const forged = await supabase
      .from("soiree_contributions")
      .insert({ group_id: home.id, label: "Faux", profile_id: bea.id });
    assert.ok(forged.error, "profile_id ne doit pas être accepté");
  });
});

describe("effacement selon la date du repas", () => {
  test("Noël à Soultz, créé un mois avant : gardé jusqu'au lendemain du repas", async () => {
    const meal = await newMeal("maison", ["dessert"], parisDate(30));
    // Créé il y a 10 jours : l'ancienne règle (7 jours) l'aurait effacé.
    await setSoireeDates(meal.id, { createdAt: new Date(Date.now() - 10 * 24 * HOUR) });
    await purgeSoirees(new Date());
    assert.equal(await groupExists(meal.id), true);

    await purgeSoirees(new Date(Date.now() + 31 * 24 * HOUR));
    assert.equal(await groupExists(meal.id), true);
    await purgeSoirees(new Date(Date.now() + 32 * 24 * HOUR));
    assert.equal(await groupExists(meal.id), false);
  });

  test("un repas créé avant la migration (sans date) garde la règle des 7 jours", async () => {
    const meal = await newMeal("commande");
    await setSoireeDates(meal.id, { mealDate: null });
    await purgeSoirees(new Date(Date.now() + 6 * 24 * HOUR));
    assert.equal(await groupExists(meal.id), true);
    await purgeSoirees(new Date(Date.now() + 8 * 24 * HOUR));
    assert.equal(await groupExists(meal.id), false);
  });
});

describe("rappel unique", () => {
  test("un repas « maison » à deux votes n'envoie qu'un rappel", async () => {
    const meal = await newMeal("maison", ["plat", "dessert"]);
    await signInAs(bea);
    await supabase.rpc("join_soiree", { token: meal.joinToken });

    // Les deux votes lancés il y a 70 min, un jour de semaine à 15 h (heure de Paris).
    const at = new Date("2026-12-02T14:00:00Z");
    await signInAs(alice);
    for (const session of await openSessions(meal.id)) {
      await setSessionCreatedAt(session.id, new Date(at.getTime() - 70 * 60 * 1000));
    }
    assert.equal(await sendVoteReminders(at), 1);
    assert.equal(await sendVoteReminders(new Date(at.getTime() + 10 * 60 * 1000)), 0);
  });
});
