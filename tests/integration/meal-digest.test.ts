// Résumé d'un repas (migration meal_digest) sur la base locale : quand un repas est marqué
// « à résumer », et quand send_meal_digests le démarque. L'écriture du message (notify-meal)
// est testée à part (digest.test.ts) ; ici, sans Vault, call_edge_function ne part pas.
//
// Heure de référence fixe, le 15 janvier 2025 (Paris = UTC+1) : les repas des autres
// fichiers, marqués « maintenant », sont plus récents et ne sont jamais dus.
// Rôles : Alice crée les repas, Bea et Chloé les rejoignent.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { addContribution, createSoiree, joinSoiree } from "../../src/lib/soirees.ts";
import {
  cleanUp,
  createGroup,
  createUser,
  mealDigestState,
  sendMealDigests,
  setMealDigestPendingSince,
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
// 15 janvier 2025 à l'heure de Paris donnée (hiver : UTC+1).
const parisTime = (hours: number, minutes = 0) =>
  new Date(Date.UTC(2025, 0, 15, hours - 1, minutes));

async function newMeal(): Promise<{ id: string; joinToken: string }> {
  await signInAs(alice);
  return createSoiree({ name: "Noël à Soultz", mode: "maison", topics: [], date: null });
}

async function join(user: TestUser, joinToken: string): Promise<void> {
  await signInAs(user);
  await joinSoiree(joinToken);
}

describe("marquer un repas à résumer", () => {
  test("le responsable qui crée son repas n'est pas une nouvelle", async () => {
    const meal = await newMeal();
    assert.equal((await mealDigestState(meal.id)).pendingSince, null);
  });

  test("une arrivée marque le repas ; un apport ensuite ne déplace pas la marque", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    const { pendingSince } = await mealDigestState(meal.id);
    assert.notEqual(pendingSince, null);

    await addContribution(meal.id, "le pain");
    assert.equal((await mealDigestState(meal.id)).pendingSince, pendingSince);
  });

  test("un foyer n'est jamais marqué", async () => {
    const foyerId = await createGroup(alice, [bea]);
    assert.deepEqual(await mealDigestState(foyerId), { pendingSince: null, sentAt: null });
  });
});

describe("envoyer les résumés", () => {
  test("moins de 10 min après le premier changement : on attend", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await setMealDigestPendingSince(meal.id, parisTime(18));

    await sendMealDigests(parisTime(18, 9));
    assert.equal(instant((await mealDigestState(meal.id)).pendingSince), parisTime(18).getTime());
  });

  test("10 min après : le repas est démarqué et la date du résumé gardée", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await setMealDigestPendingSince(meal.id, parisTime(18));

    assert.ok((await sendMealDigests(parisTime(18, 10))) >= 1);
    const state = await mealDigestState(meal.id);
    assert.equal(state.pendingSince, null);
    assert.equal(instant(state.sentAt), parisTime(18, 10).getTime());

    // Rien de neuf : la passe suivante ne renvoie rien pour ce repas.
    await sendMealDigests(parisTime(18, 20));
    assert.equal(instant((await mealDigestState(meal.id)).sentAt), parisTime(18, 10).getTime());
  });

  test("la nuit, le résumé attend 8 h, puis part avec tout", async () => {
    const meal = await newMeal();
    await join(bea, meal.joinToken);
    await join(chloe, meal.joinToken);
    await setMealDigestPendingSince(meal.id, parisTime(22, 30));

    assert.equal(await sendMealDigests(parisTime(23)), 0);
    assert.notEqual((await mealDigestState(meal.id)).pendingSince, null);

    // 8 h le lendemain (16 janvier).
    const nextMorning = new Date(parisTime(8).getTime() + 24 * 60 * 60 * 1000);
    await sendMealDigests(nextMorning);
    assert.equal((await mealDigestState(meal.id)).pendingSince, null);
  });
});
