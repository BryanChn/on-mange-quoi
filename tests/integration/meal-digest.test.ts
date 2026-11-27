// Résumé d'un repas en deux vitesses (migrations meal_digest et meal_digest_audiences) sur
// la base locale : quand un repas est marqué « à résumer », et quand send_meal_digests le
// démarque, pour l'organisateur (1 min) et pour les autres (10 min, 30 min d'écart, 2
// nouveautés). L'écriture du message (notify-meal) est testée à part (digest.test.ts) ; ici,
// sans Vault, call_edge_function ne part pas.
//
// Heure de référence fixe, le 15 janvier 2099 (Paris = UTC+1), dans le futur exprès : la vraie
// tâche pg_cron de la base locale (toutes les 30 s, à l'heure réelle) voyait des marques de 2025
// en retard, envoyait le résumé et effaçait la marque entre deux lignes d'un test (échec rare,
// selon l'instant où elle tombait). Des marques dans le futur ne sont jamais dues pour elle.
// Rôles : Alice crée les repas (organisatrice), Bea et Chloé les rejoignent.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { addContribution, createSoiree, joinSoiree } from "../../src/lib/soirees.ts";
import {
  cleanUp,
  createGroup,
  createUser,
  mealDigestState,
  sendMealDigests,
  setJoinedAt,
  setMealDigest,
  signInAs,
  type TestUser,
} from "./fixtures.ts";

let alice: TestUser;
let bea: TestUser;
let chloe: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  chloe = await createUser("Chloe");
});

after(cleanUp);

const instant = (value: string | null) => (value === null ? null : new Date(value).getTime());
// 15 janvier 2099 à l'heure de Paris donnée (hiver : UTC+1).
const parisTime = (hours: number, minutes = 0, seconds = 0) =>
  new Date(Date.UTC(2099, 0, 15, hours - 1, minutes, seconds));

async function newMeal(): Promise<{ id: string; joinToken: string }> {
  await signInAs(alice);
  return createSoiree({ name: "Noël à Soultz", mode: "maison", topics: [], date: null });
}

async function join(user: TestUser, joinToken: string): Promise<void> {
  await signInAs(user);
  await joinSoiree(joinToken);
}

describe("marquer un repas à résumer", () => {
  test("le responsable qui crée son repas n'est une nouvelle pour personne", async () => {
    const meal = await newMeal();
    assert.deepEqual(await mealDigestState(meal.id), {
      pendingSince: null,
      sentAt: null,
      ownerPendingSince: null,
      ownerSentAt: null,
    });
  });

  test("une arrivée marque le repas pour l'organisatrice et pour les autres", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    const state = await mealDigestState(meal.id);
    assert.notEqual(state.pendingSince, null);
    assert.notEqual(state.ownerPendingSince, null);

    // Un apport ensuite ne déplace pas les marques.
    await addContribution(meal.id, "le pain");
    const after = await mealDigestState(meal.id);
    assert.equal(after.pendingSince, state.pendingSince);
    assert.equal(after.ownerPendingSince, state.ownerPendingSince);
  });

  test("l'apport de l'organisatrice est une nouvelle pour les autres, pas pour elle", async () => {
    const meal = await newMeal();
    await addContribution(meal.id, "le vin");
    const state = await mealDigestState(meal.id);
    assert.notEqual(state.pendingSince, null);
    assert.equal(state.ownerPendingSince, null);
  });

  test("un foyer n'est jamais marqué", async () => {
    const foyerId = await createGroup(alice, [bea]);
    const state = await mealDigestState(foyerId);
    assert.equal(state.pendingSince, null);
    assert.equal(state.ownerPendingSince, null);
  });
});

describe("le résumé de l'organisatrice", () => {
  test("1 min après le changement, pas avant", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await setMealDigest(meal.id, { ownerPendingSince: parisTime(18), pendingSince: null });

    await sendMealDigests(parisTime(18, 0, 50));
    assert.notEqual((await mealDigestState(meal.id)).ownerPendingSince, null);

    await sendMealDigests(parisTime(18, 1));
    const state = await mealDigestState(meal.id);
    assert.equal(state.ownerPendingSince, null);
    assert.equal(instant(state.ownerSentAt), parisTime(18, 1).getTime());
  });
});

describe("le résumé des autres", () => {
  test("une seule nouveauté : il attend la suivante", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await setMealDigest(meal.id, { pendingSince: parisTime(18), ownerPendingSince: null });

    await sendMealDigests(parisTime(18, 15));
    assert.notEqual((await mealDigestState(meal.id)).pendingSince, null);

    // Deuxième nouveauté : le résumé part, avec les deux.
    await join(chloe, meal.joinToken);
    await setMealDigest(meal.id, { pendingSince: parisTime(18), ownerPendingSince: null });
    await sendMealDigests(parisTime(18, 20));
    const state = await mealDigestState(meal.id);
    assert.equal(state.pendingSince, null);
    assert.equal(instant(state.sentAt), parisTime(18, 20).getTime());
  });

  test("10 min après le premier changement, pas avant", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await join(chloe, meal.joinToken);
    await setMealDigest(meal.id, { pendingSince: parisTime(18), ownerPendingSince: null });

    await sendMealDigests(parisTime(18, 9));
    assert.notEqual((await mealDigestState(meal.id)).pendingSince, null);
    await sendMealDigests(parisTime(18, 10));
    assert.equal((await mealDigestState(meal.id)).pendingSince, null);
  });

  test("30 min au moins après le résumé précédent", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await join(chloe, meal.joinToken);
    await setMealDigest(meal.id, {
      sentAt: parisTime(18),
      pendingSince: parisTime(18, 5),
      ownerPendingSince: null,
    });
    // Les deux arrivées sont des nouveautés depuis le résumé de 18 h.
    await setJoinedAt(meal.id, bea.id, parisTime(18, 5));
    await setJoinedAt(meal.id, chloe.id, parisTime(18, 5));

    await sendMealDigests(parisTime(18, 29));
    assert.notEqual((await mealDigestState(meal.id)).pendingSince, null);
    await sendMealDigests(parisTime(18, 30));
    assert.equal(instant((await mealDigestState(meal.id)).sentAt), parisTime(18, 30).getTime());
  });
});

describe("la nuit", () => {
  test("rien entre 22 h et 8 h, puis tout part le matin", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await join(chloe, meal.joinToken);
    await setMealDigest(meal.id, {
      pendingSince: parisTime(22, 30),
      ownerPendingSince: parisTime(22, 30),
    });

    assert.equal(await sendMealDigests(parisTime(23)), 0);
    let state = await mealDigestState(meal.id);
    assert.notEqual(state.pendingSince, null);
    assert.notEqual(state.ownerPendingSince, null);

    // 8 h le lendemain (16 janvier).
    const nextMorning = new Date(parisTime(8).getTime() + 24 * 60 * 60 * 1000);
    await sendMealDigests(nextMorning);
    state = await mealDigestState(meal.id);
    assert.equal(state.pendingSince, null);
    assert.equal(state.ownerPendingSince, null);
  });
});
