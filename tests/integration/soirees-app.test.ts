// Tests d'intégration de src/lib/soirees.ts (et du tri foyers / soirées de l'accueil) sur la
// base locale : le vrai code de l'app, la vraie RLS, les vraies fonctions SQL.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice organise, Bea rejoint avec son compte, Dan n'est pas invité.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { fetchGroups } from "../../src/lib/groups.ts";
import { fetchHome } from "../../src/lib/home.ts";
import {
  chooseRestaurant,
  createSoiree,
  fetchFirstSoireeId,
  fetchSoiree,
  fetchSoireePreview,
  joinSoiree,
  removeParticipant,
} from "../../src/lib/soirees.ts";
import { toJoinFailure } from "../../src/lib/soiree-rules.ts";
import {
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
  return createSoiree(name);
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
