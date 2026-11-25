// Tests d'intégration de src/lib/account.ts (suppression de compte, exigée par Apple) sur la
// base locale. Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Chaque test crée sa propre Eve, dont le compte est supprimé. Alice, Bea et Chloé restent.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { deleteAccount, fetchDeletionImpact } from "../../src/lib/account.ts";
import { createGroup, fetchGroup, joinGroup } from "../../src/lib/groups.ts";
import {
  addProposal,
  closeSession,
  fetchLatestSession,
  fetchSession,
  setVote,
  startSession,
} from "../../src/lib/votes.ts";
import {
  cleanUp,
  createUser,
  groupExists,
  profileExists,
  signInAs,
  userExists,
  type TestUser,
} from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

// Le moment (midi ou soir) dépend de l'heure du test : il est vérifié dans vote-moment.test.ts.
function withoutMoment<T extends { moment?: unknown }>(session: T | null) {
  if (!session) return session;
  const { moment, ...rest } = session;
  assert.ok(moment === "midi" || moment === "soir");
  return rest;
}

let alice: TestUser;
let bea: TestUser;
let chloe: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  chloe = await createUser("Chloe");
});

after(cleanUp);

// Groupe créé par owner, rejoint dans l'ordre par members.
async function groupOf(owner: TestUser, members: TestUser[], name = "Groupe"): Promise<string> {
  await signInAs(owner);
  const groupId = await createGroup(name);
  const { invite_code } = await fetchGroup(groupId);
  for (const member of members) {
    await signInAs(member);
    await joinGroup(invite_code);
  }
  return groupId;
}

describe("prévenir avant de supprimer", () => {
  test("liste les groupes possédés, leur successeur, et les votes en cours organisés", async () => {
    const eve = await createUser("Eve");
    const shared = await groupOf(eve, [bea, chloe], "Partagé");
    const solo = await groupOf(eve, [], "Solo");
    await startSession(shared);
    await startSession(solo);

    assert.deepEqual(await fetchDeletionImpact(), {
      ownedGroups: [
        { groupId: shared, groupName: "Partagé", successorName: "Bea" },
        { groupId: solo, groupName: "Solo", successorName: null },
      ],
      openSessionCount: 2,
    });
  });
});

describe("supprimer son compte", () => {
  test("groupes transmis ou supprimés, compte et profil effacés, déconnexion", async () => {
    const eve = await createUser("Eve");
    const shared = await groupOf(eve, [bea, chloe]);
    const solo = await groupOf(eve, []);
    const alicesGroup = await groupOf(alice, [eve, bea]);

    await signInAs(eve);
    await deleteAccount();

    const { data } = await supabase.auth.getSession();
    assert.equal(data.session, null);
    assert.equal(await userExists(eve.id), false);
    assert.equal(await profileExists(eve.id), false);

    // Groupe partagé : la couronne passe au plus ancien membre.
    await signInAs(bea);
    assert.equal((await fetchGroup(shared)).owner_id, bea.id);
    // Groupe où Eve était seule : supprimé.
    assert.equal(await groupExists(solo), false);
    // Groupe d'un autre : Eve n'en fait plus partie.
    const members = (await fetchGroup(alicesGroup)).members.map((m) => m.name);
    assert.deepEqual(members, ["Alice", "Bea"]);
  });

  test("vote en cours : plats sans vote retirés, plats votés gardés sans auteur", async () => {
    const eve = await createUser("Eve");
    const groupId = await groupOf(alice, [eve, bea]);
    await signInAs(eve);
    const sessionId = await startSession(groupId);
    await addProposal(sessionId, "Pizza");
    await addProposal(sessionId, "Tacos");
    const tacos = (await fetchSession(sessionId)).proposals.find((p) => p.name === "Tacos");
    assert.ok(tacos);
    await signInAs(bea);
    await setVote(tacos.id, true);

    await signInAs(eve);
    await deleteAccount();

    await signInAs(bea);
    const session = await fetchSession(sessionId);
    assert.deepEqual(
      session.proposals.map((p) => p.name),
      ["Tacos"],
    );
    assert.equal(session.isOpen, true);
    assert.equal(session.organizerName, null);
    // L'organisatrice partie, seule l'owner du groupe peut encore clôturer.
    assert.equal(session.canClose, false);
    await signInAs(alice);
    assert.equal((await fetchSession(sessionId)).canClose, true);
    await closeSession(sessionId);
    assert.equal((await fetchSession(sessionId)).winnerProposalId, tacos.id);
  });

  test("vote clos : le plat gagnant reste, même sans vote et sans auteur", async () => {
    const eve = await createUser("Eve");
    const groupId = await groupOf(alice, [eve]);
    await signInAs(eve);
    const sessionId = await startSession(groupId);
    await addProposal(sessionId, "Curry");
    await closeSession(sessionId);

    await deleteAccount();

    await signInAs(alice);
    assert.deepEqual(withoutMoment(await fetchLatestSession(groupId)), {
      id: sessionId,
      isOpen: false,
      winnerName: "Curry",
    });
  });
});
