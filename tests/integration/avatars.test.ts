// Avatars prédéfinis (migration profile_avatar) sur la base locale : le choix enregistré se
// voit chez les autres membres, et le serveur refuse ce que l'app ne doit pas pouvoir faire.
// Rôles : Alice owner, Chloé membre, Dan hors du groupe.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { updateMyAvatar } from "../../src/lib/account.ts";
import { fetchGroup } from "../../src/lib/groups.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let chloe: TestUser;
let dan: TestUser;
let groupId: string;

before(async () => {
  alice = await createUser("Alice");
  chloe = await createUser("Chloe");
  dan = await createUser("Dan");
  groupId = await createGroup(alice, [chloe]);
});

after(cleanUp);

async function avatarSeenByAlice(memberId: string): Promise<string | null> {
  await signInAs(alice);
  const group = await fetchGroup(groupId);
  const member = group.members.find((m) => m.id === memberId);
  assert.ok(member, "membre introuvable dans le groupe");
  return member.avatar;
}

describe("avatars prédéfinis", () => {
  test("par défaut l'initiale, puis le choix se voit chez les autres membres", async () => {
    assert.equal(await avatarSeenByAlice(chloe.id), null);

    await signInAs(chloe);
    await updateMyAvatar("pizza");
    assert.equal(await avatarSeenByAlice(chloe.id), "pizza");

    // Revenir à l'initiale.
    await signInAs(chloe);
    await updateMyAvatar(null);
    assert.equal(await avatarSeenByAlice(chloe.id), null);
  });

  test("une valeur hors de la liste est refusée par le serveur", async () => {
    await signInAs(chloe);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar: "licorne" })
      .eq("id", chloe.id);
    assert.ok(error, "la contrainte profiles_avatar_check doit refuser « licorne »");
    assert.equal(await avatarSeenByAlice(chloe.id), null);
  });

  test("on ne change pas l'avatar d'un autre membre", async () => {
    await signInAs(chloe);
    await updateMyAvatar("burger");

    // Dan (hors du groupe) puis Alice (co-membre) tentent de changer celui de Chloé :
    // la RLS (id = auth.uid()) ne leur laisse aucune ligne à modifier.
    for (const intruder of [dan, alice]) {
      await signInAs(intruder);
      await supabase.from("profiles").update({ avatar: "ramen" }).eq("id", chloe.id);
    }
    assert.equal(await avatarSeenByAlice(chloe.id), "burger");
  });
});
