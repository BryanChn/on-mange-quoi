// Tests d'intégration de src/lib/groups.ts sur la base locale (voir votes.test.ts).
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice crée les groupes (owner), Bea les rejoint en premier, Chloé ensuite,
// Dan n'y entre jamais.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  createGroup,
  deleteGroup,
  fetchGroup,
  fetchGroups,
  fetchLeaveImpact,
  joinGroup,
  leaveGroup,
} from "../../src/lib/groups.ts";
import { startSession } from "../../src/lib/votes.ts";
import {
  cleanUp,
  countSessions,
  createUser,
  groupExists,
  signInAs,
  type TestUser,
} from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let chloe: TestUser;
let dan: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  chloe = await createUser("Chloe");
  dan = await createUser("Dan");
});

after(cleanUp);

// Groupe d'Alice, rejoint dans l'ordre par `members` avec le code d'invitation.
async function groupWith(members: TestUser[]): Promise<string> {
  await signInAs(alice);
  const groupId = await createGroup("Maison test");
  const { invite_code } = await fetchGroup(groupId);
  for (const member of members) {
    await signInAs(member);
    assert.equal(await joinGroup(invite_code), groupId);
  }
  return groupId;
}

async function memberNames(groupId: string): Promise<string[]> {
  return (await fetchGroup(groupId)).members.map((member) => member.name);
}

describe("créer et rejoindre", () => {
  test("le créateur devient owner et premier membre, avec un code d'invitation", async () => {
    await signInAs(alice);
    const groupId = await createGroup("Maison test");

    const group = await fetchGroup(groupId);
    assert.equal(group.owner_id, alice.id);
    assert.equal(group.name, "Maison test");
    assert.ok(group.invite_code.length > 0);
    assert.deepEqual(await memberNames(groupId), ["Alice"]);
    assert.ok((await fetchGroups()).some((g) => g.id === groupId));
  });

  test("les membres apparaissent du plus ancien au plus récent", async () => {
    const groupId = await groupWith([bea, chloe]);

    assert.deepEqual(await memberNames(groupId), ["Alice", "Bea", "Chloe"]);
  });

  test("rejoindre deux fois ne crée pas de doublon", async () => {
    const groupId = await groupWith([bea]);
    const { invite_code } = await fetchGroup(groupId);

    assert.equal(await joinGroup(invite_code), groupId);
    assert.deepEqual(await memberNames(groupId), ["Alice", "Bea"]);
  });

  test("un code invalide renvoie null, pas une erreur", async () => {
    await signInAs(dan);
    assert.equal(await joinGroup("PASUNCODE"), null);
  });

  test("un non-membre ne voit pas le groupe", async () => {
    const groupId = await groupWith([bea]);

    await signInAs(dan);
    assert.equal((await fetchGroups()).length, 0);
    await assert.rejects(fetchGroup(groupId));
  });
});

describe("prévoir les conséquences d'un départ", () => {
  test("simple membre : le groupe continue sans lui", async () => {
    const groupId = await groupWith([bea, chloe]);

    await signInAs(chloe);
    assert.deepEqual(await fetchLeaveImpact(groupId), { kind: "member" });
  });

  test("owner : la couronne irait au membre le plus ancien", async () => {
    const groupId = await groupWith([bea, chloe]);

    await signInAs(alice);
    assert.deepEqual(await fetchLeaveImpact(groupId), {
      kind: "transfer",
      successorName: "Bea",
    });
  });

  test("owner seul : le groupe serait supprimé", async () => {
    const groupId = await groupWith([]);

    assert.deepEqual(await fetchLeaveImpact(groupId), { kind: "delete" });
  });
});

describe("quitter", () => {
  test("un simple membre part : le groupe continue, il n'y a plus accès", async () => {
    const groupId = await groupWith([bea, chloe]);

    await signInAs(chloe);
    await leaveGroup(groupId);
    await assert.rejects(fetchGroup(groupId));

    await signInAs(alice);
    assert.deepEqual(await memberNames(groupId), ["Alice", "Bea"]);
  });

  test("l'owner part : la couronne passe au plus ancien, le groupe continue", async () => {
    const groupId = await groupWith([bea, chloe]);

    await signInAs(alice);
    await leaveGroup(groupId);
    await assert.rejects(fetchGroup(groupId));

    await signInAs(bea);
    const group = await fetchGroup(groupId);
    assert.equal(group.owner_id, bea.id);
    assert.deepEqual(await memberNames(groupId), ["Bea", "Chloe"]);
  });

  test("l'owner seul part : le groupe est supprimé avec son historique", async () => {
    const groupId = await groupWith([]);
    await startSession(groupId);

    await leaveGroup(groupId);

    assert.equal(await groupExists(groupId), false);
    assert.equal(await countSessions(groupId), 0);
  });

  test("on ne quitte pas un groupe dont on n'est pas membre", async () => {
    const groupId = await groupWith([bea]);

    await signInAs(dan);
    await assert.rejects(leaveGroup(groupId), { code: "P0002" });
  });
});

describe("supprimer pour tous", () => {
  test("un membre qui n'est pas owner ne peut pas supprimer le groupe", async () => {
    const groupId = await groupWith([bea]);

    // La RLS filtre sans erreur (0 ligne) : deleteGroup doit le signaler quand même.
    await signInAs(bea);
    await assert.rejects(deleteGroup(groupId), /non supprimé/);
    assert.equal(await groupExists(groupId), true);
  });

  test("l'owner supprime le groupe : il disparaît pour tous, sessions comprises", async () => {
    const groupId = await groupWith([bea]);
    await signInAs(bea);
    await startSession(groupId);

    await signInAs(alice);
    await deleteGroup(groupId);

    assert.equal(await groupExists(groupId), false);
    assert.equal(await countSessions(groupId), 0);
    await signInAs(bea);
    assert.ok(!(await fetchGroups()).some((g) => g.id === groupId));
  });
});

describe("sécurité (audit du 2026-11-27)", () => {
  test("10 codes faux en 15 minutes, puis même le bon code est refusé", async () => {
    const groupId = await groupWith([]);
    const { invite_code } = await fetchGroup(groupId);
    const eve = await createUser("Eve");
    await signInAs(eve);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal(await joinGroup(`FAUX${attempt}XYZ`), null);
    }
    await assert.rejects(joinGroup(invite_code), { hint: "too_many_attempts" });
  });

  test("sans connexion, aucune table n'est lisible ; l'aperçu d'invitation marche", async () => {
    await supabase.auth.signOut();
    const groups = await supabase.from("groups").select("id").limit(1);
    assert.equal(groups.error?.code, "42501", "permission refusée, pas une liste vide");
    const preview = await supabase.rpc("soiree_preview", { token: "inconnu" });
    assert.equal(preview.error, null);
    assert.deepEqual(preview.data, []);
  });
});
