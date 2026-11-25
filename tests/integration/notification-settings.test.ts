// Réglages des notifications (migration notification_settings) sur la base locale : le vrai
// code de src/lib/notification-settings.ts, RLS et droits par colonne compris.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice règle ses notifications, Bea partage un foyer avec elle.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchNotificationSettings,
  saveNotificationSetting,
} from "../../src/lib/notification-settings.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  await createGroup(alice, [bea]);
});

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
