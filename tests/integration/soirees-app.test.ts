// Tests d'intégration de src/lib/soirees.ts (et du tri foyers / soirées de l'accueil) sur la
// base locale : le vrai code de l'app, la vraie RLS, les vraies fonctions SQL.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice organise, Bea rejoint avec son compte, Dan n'est pas invité.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { fetchGroups, isSoireeGroup, joinGroup } from "../../src/lib/groups.ts";
import { fetchHome } from "../../src/lib/home.ts";
import { fetchSession, startSession } from "../../src/lib/votes.ts";
import {
  addOrderItem,
  chooseRestaurant,
  createSoiree,
  isOrderingClosedError,
  markOrdered,
  removeOrderItem,
  setOrderItemQuantity,
  fetchFirstSoireeId,
  fetchSoiree,
  fetchSoireePreview,
  joinSoiree,
  removeParticipant,
} from "../../src/lib/soirees.ts";
import { toJoinFailure } from "../../src/lib/soiree-rules.ts";
import {
  addMembersDirectly,
  cleanUp,
  createGroup,
  createUser,
  signInAs,
  signInAsGuest,
  signOutCompletely,
  trackCurrentGuest,
  type TestUser,
} from "./fixtures.ts";

let alice: TestUser;
let bea: TestUser;
let dan: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  dan = await createUser("Dan");
});

after(cleanUp);

async function aliceCreates(name = "Samedi chez Alice") {
  await signInAs(alice);
  // Un repas « commande » pour aujourd'hui, comme le crée l'écran avec « On se commande un truc ».
  return createSoiree({ name, mode: "commande", topics: [], date: null });
}

describe("aperçu du lien, avant de rejoindre", () => {
  test("sans compte, on voit le nom, l'organisatrice et qui vient ; rien d'autre", async () => {
    const soiree = await aliceCreates();
    await signOutCompletely();
    const preview = await fetchSoireePreview(soiree.joinToken);
    assert.deepEqual(preview, {
      id: soiree.id,
      name: "Samedi chez Alice",
      ownerName: "Alice",
      step: "choix",
      memberCount: 1,
      members: [{ name: "Alice", avatar: null }],
      isMember: false,
    });
  });

  test("un lien inconnu ne renvoie rien", async () => {
    await signOutCompletely();
    assert.equal(await fetchSoireePreview("AAAAAAAAAAAAAAAAAAAAAA"), null);
  });

  test("déjà dans la soirée : l'aperçu le dit", async () => {
    const soiree = await aliceCreates();
    assert.equal((await fetchSoireePreview(soiree.joinToken))?.isMember, true);
  });
});

describe("rejoindre", () => {
  test("sans compte : connexion anonyme, profil d'invité marqué « invité »", async () => {
    const soiree = await aliceCreates();
    await signOutCompletely();
    const joinedId = await joinSoiree(soiree.joinToken, { name: "Tom", avatar: "ramen" });
    await trackCurrentGuest();
    assert.equal(joinedId, soiree.id);

    const detail = await fetchSoiree(soiree.id);
    assert.deepEqual(
      detail.members.map(({ name, avatar, isGuest }) => ({ name, avatar, isGuest })),
      [
        { name: "Alice", avatar: null, isGuest: false },
        { name: "Tom", avatar: "ramen", isGuest: true },
      ],
    );
    assert.equal(await fetchFirstSoireeId(), soiree.id);
  });

  test("avec un compte : son nom, pas de badge invité", async () => {
    const soiree = await aliceCreates();
    await signInAs(bea);
    await joinSoiree(soiree.joinToken);
    const detail = await fetchSoiree(soiree.id);
    assert.equal(detail.members.find((member) => member.id === bea.id)?.isGuest, false);
  });

  test("un refus garde sa raison, lisible par l'écran", async () => {
    await signInAs(bea);
    const failure = await joinSoiree("AAAAAAAAAAAAAAAAAAAAAA").then(
      () => null,
      (error: unknown) => toJoinFailure(error),
    );
    assert.equal(failure, "invalid_link");
  });
});

describe("la soirée", () => {
  test("un non-invité ne la lit pas", async () => {
    const soiree = await aliceCreates();
    await signInAs(dan);
    await assert.rejects(fetchSoiree(soiree.id));
  });

  test("la responsable retire quelqu'un ; un autre participant ne peut pas", async () => {
    const soiree = await aliceCreates();
    await signOutCompletely();
    await joinSoiree(soiree.joinToken, { name: "Tom", avatar: null });
    const tom = await trackCurrentGuest();
    await signInAs(bea);
    await joinSoiree(soiree.joinToken);

    await assert.rejects(removeParticipant(soiree.id, tom.id), /non retiré/);
    await signInAs(alice);
    await removeParticipant(soiree.id, tom.id);
    assert.equal((await fetchSoiree(soiree.id)).members.length, 2);

    await signInAsGuest(tom);
    await assert.rejects(fetchSoiree(soiree.id));
  });

  test("la responsable choisit le resto : la commande s'ouvre", async () => {
    const soiree = await aliceCreates();
    await chooseRestaurant(soiree.id, "Kebab du coin");
    const detail = await fetchSoiree(soiree.id);
    assert.equal(detail.step, "commande");
    assert.equal(detail.restaurant, "Kebab du coin");
  });
});

describe("accueil : les soirées à part des foyers", () => {
  test("une soirée n'est ni dans « Tes groupes » ni dans « Ce soir »", async () => {
    // Un compte neuf : les tests précédents ont fait entrer Bea dans d'autres soirées.
    const eve = await createUser("Eve");
    const foyerId = await createGroup(eve, []);
    const soiree = await aliceCreates();
    await signInAs(eve);
    await joinSoiree(soiree.joinToken);

    const home = await fetchHome();
    assert.deepEqual(
      home.groups.map((group) => group.id),
      [foyerId],
    );
    assert.deepEqual(
      home.soirees.map(({ id, name, step }) => ({ id, name, step })),
      [{ id: soiree.id, name: "Samedi chez Alice", step: "choix" }],
    );
    assert.deepEqual(
      (await fetchGroups()).map((group) => group.id),
      [foyerId],
    );
  });
});

describe("la commande", () => {
  async function soireeWithTom() {
    const soiree = await aliceCreates();
    await signOutCompletely();
    await joinSoiree(soiree.joinToken, { name: "Tom", avatar: null });
    const tom = await trackCurrentGuest();
    await signInAs(alice);
    await chooseRestaurant(soiree.id, "Kebab du coin");
    return { soiree, tom };
  }

  test("chacun ajoute, ajuste et retire ses lignes ; tout le monde les lit", async () => {
    const { soiree, tom } = await soireeWithTom();
    await addOrderItem(soiree.id, { label: " Kebab sauce blanche ", note: "  " });
    await signInAsGuest(tom);
    await addOrderItem(soiree.id, { label: "Tacos XL", note: "sans oignon" });
    const tacos = (await fetchSoiree(soiree.id)).items.find((item) => item.label === "Tacos XL");
    assert.ok(tacos);
    await setOrderItemQuantity(tacos.id, 2);

    await signInAs(alice);
    const items = (await fetchSoiree(soiree.id)).items;
    assert.deepEqual(
      items.map(({ profileId, label, quantity, note }) => ({ profileId, label, quantity, note })),
      [
        { profileId: alice.id, label: "Kebab sauce blanche", quantity: 1, note: null },
        { profileId: tom.id, label: "Tacos XL", quantity: 2, note: "sans oignon" },
      ],
    );
  });

  test("on ne modifie pas la ligne d'un autre ; la responsable peut la retirer", async () => {
    const { soiree, tom } = await soireeWithTom();
    await signInAsGuest(tom);
    await addOrderItem(soiree.id, { label: "Tacos", note: null });
    const tacos = (await fetchSoiree(soiree.id)).items[0];

    await signInAs(bea);
    await joinSoiree(soiree.joinToken);
    await assert.rejects(setOrderItemQuantity(tacos.id, 5), /non modifiée/);
    await assert.rejects(removeOrderItem(tacos.id), /non retirée/);

    await signInAs(alice);
    await removeOrderItem(tacos.id);
    assert.deepEqual((await fetchSoiree(soiree.id)).items, []);
  });

  test("« Commande passée » fige tout : l'écran reconnaît le refus", async () => {
    const { soiree, tom } = await soireeWithTom();
    await addOrderItem(soiree.id, { label: "Kebab", note: null });
    await markOrdered(soiree.id);
    assert.equal((await fetchSoiree(soiree.id)).step, "passee");

    await signInAsGuest(tom);
    const refusal = await addOrderItem(soiree.id, { label: "Coca", note: null }).then(
      () => null,
      (error: unknown) => error,
    );
    assert.equal(isOrderingClosedError(refusal), true);
  });

  test("le vote d'une soirée se sait « soirée » (on y propose des restos)", async () => {
    const soiree = await aliceCreates();
    const sessionId = await startSession(soiree.id);
    assert.equal((await fetchSession(sessionId)).isSoiree, true);

    const foyerId = await createGroup(alice, []);
    await signInAs(alice);
    const foyerSession = await startSession(foyerId);
    assert.equal((await fetchSession(foyerSession)).isSoiree, false);
  });
});

describe("rejoindre une soirée avec son code (déjà l'app)", () => {
  test("avec son compte : membre, et l'app sait que c'est une soirée", async () => {
    const soiree = await aliceCreates();
    const { inviteCode } = await fetchSoiree(soiree.id);
    assert.match(inviteCode, /^[A-Z2-9]{8}$/);

    await signInAs(bea);
    const joinedId = await joinGroup(inviteCode.toLowerCase());
    assert.equal(joinedId, soiree.id);
    assert.equal(await isSoireeGroup(soiree.id), true);
    const joined = (await fetchSoiree(soiree.id)).members.find((member) => member.id === bea.id);
    assert.equal(joined?.isGuest, false);
  });

  test("mêmes règles que le lien : refusé après « Commande passée » ou à 20", async () => {
    const closed = await aliceCreates();
    const closedCode = (await fetchSoiree(closed.id)).inviteCode;
    await chooseRestaurant(closed.id, "Kebab");
    await markOrdered(closed.id);
    await signInAs(dan);
    const closedFailure = await joinGroup(closedCode).then(
      () => null,
      (error: unknown) => toJoinFailure(error),
    );
    assert.equal(closedFailure, "soiree_closed");

    const full = await aliceCreates();
    const fullCode = (await fetchSoiree(full.id)).inviteCode;
    const others: TestUser[] = [];
    for (let i = 0; i < 19; i++) others.push(await createUser(`Plein${i}`));
    await addMembersDirectly(full.id, others);
    await signInAs(dan);
    const fullFailure = await joinGroup(fullCode).then(
      () => null,
      (error: unknown) => toJoinFailure(error),
    );
    assert.equal(fullFailure, "soiree_full");
  });

  test("un foyer se rejoint toujours avec son code", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(bea);
    assert.equal(await isSoireeGroup(foyerId), false);
  });
});
