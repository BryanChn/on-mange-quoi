// Réglages des notifications (migration notification_settings) sur la base locale : le vrai
// code de src/lib/notification-settings.ts, RLS et droits par colonne compris.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice règle ses notifications, Bea partage un foyer avec elle.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { leaveGroup } from "../../src/lib/groups.ts";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchMealNotificationsOn,
  fetchNotificationSettings,
  saveNotificationSetting,
  setMealNotificationsOn,
} from "../../src/lib/notification-settings.ts";
import { createSoiree, joinSoiree } from "../../src/lib/soirees.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let foyerId: string;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  foyerId = await createGroup(alice, [bea]);
});

// Repas créé par Alice, rejoint par Bea.
async function mealWithBea(): Promise<string> {
  await signInAs(alice);
  const meal = await createSoiree({ name: "Noël", mode: "maison", topics: [], date: null });
  await signInAs(bea);
  await joinSoiree(meal.joinToken);
  return meal.id;
}

after(cleanUp);

describe("réglages des notifications", () => {
  test("sans réglage, tout est activé", async () => {
    await signInAs(bea);
    assert.deepEqual(await fetchNotificationSettings(), DEFAULT_NOTIFICATION_SETTINGS);
  });

  test("couper un interrupteur laisse l'autre activé, et se relit", async () => {
    await signInAs(alice);
    await saveNotificationSetting("meals", false);
    assert.deepEqual(await fetchNotificationSettings(), { votes: true, meals: false });

    await saveNotificationSetting("votes", false);
    await saveNotificationSetting("meals", true);
    assert.deepEqual(await fetchNotificationSettings(), { votes: false, meals: true });
  });

  test("une co-membre ne voit pas les réglages d'une autre", async () => {
    await signInAs(alice);
    await saveNotificationSetting("votes", false);

    await signInAs(bea);
    const { data, error } = await supabase
      .from("notification_settings")
      .select("profile_id")
      .eq("profile_id", alice.id);
    assert.equal(error, null);
    assert.deepEqual(data, []);
  });

  test("personne ne règle les notifications d'une autre", async () => {
    await signInAs(bea);
    const { error } = await supabase
      .from("notification_settings")
      .upsert({ profile_id: alice.id, votes: true });
    assert.ok(error, "l'écriture pour Alice doit être refusée");

    await signInAs(alice);
    assert.equal((await fetchNotificationSettings()).votes, false);
  });

  test("la date de modification vient du serveur, jamais de l'app", async () => {
    await signInAs(alice);
    const { error } = await supabase
      .from("notification_settings")
      .update({ updated_at: "2099-01-01T00:00:00Z" } as never)
      .eq("profile_id", alice.id);
    assert.ok(error, "updated_at ne doit pas être modifiable");
  });
});

describe("couper un seul repas", () => {
  test("activé par défaut, coupé puis rétabli, deux touchers d'affilée sans erreur", async () => {
    const mealId = await mealWithBea();
    assert.equal(await fetchMealNotificationsOn(mealId), true);

    await setMealNotificationsOn(mealId, false);
    await setMealNotificationsOn(mealId, false);
    assert.equal(await fetchMealNotificationsOn(mealId), false);

    await setMealNotificationsOn(mealId, true);
    await setMealNotificationsOn(mealId, true);
    assert.equal(await fetchMealNotificationsOn(mealId), true);
  });

  test("pas dans un foyer", async () => {
    await signInAs(bea);
    await assert.rejects(setMealNotificationsOn(foyerId, false));
  });

  test("invisible pour les autres, et personne ne coupe pour une autre", async () => {
    const mealId = await mealWithBea();
    await setMealNotificationsOn(mealId, false);

    await signInAs(alice);
    const { data } = await supabase
      .from("meal_notification_mutes")
      .select("profile_id")
      .eq("group_id", mealId);
    assert.deepEqual(data, []);
    const { error } = await supabase
      .from("meal_notification_mutes")
      .insert({ group_id: mealId, profile_id: bea.id });
    assert.ok(error, "Alice ne doit pas couper pour Bea");
  });

  test("quitter le repas efface le réglage : on revient activé", async () => {
    const mealId = await mealWithBea();
    await setMealNotificationsOn(mealId, false);
    await leaveGroup(mealId);

    const { count } = await supabase
      .from("meal_notification_mutes")
      .select("*", { count: "exact", head: true })
      .eq("group_id", mealId);
    assert.equal(count, 0);
  });
});
