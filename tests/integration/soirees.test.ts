// Soirées et commande groupée (migration soirees) sur la base locale : rejoindre par le
// lien (avec ou sans compte), comptes anonymes cantonnés à leur soirée, choix du resto
// (fixé ou voté), lignes de commande, « Commande passée », purge.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice crée les soirées (responsable), Bea les rejoint avec son compte, Dan n'y
// entre jamais. Les invités anonymes sont créés à la demande (signInAsNewGuest).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { addProposal, closeSession, setVote, startSession } from "../../src/lib/votes.ts";
import {
  addMembersDirectly,
  cleanUp,
  createGroup,
  createUser,
  groupExists,
  purgeSoirees,
  signInAs,
  signInAsGuest,
  signInAsNewGuest,
  soireeOrderedAt,
  userExists,
  type TestGuest,
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

type Soiree = { id: string; joinToken: string; inviteCode: string };

// Soirée créée par Alice (create_soiree), comme le fera l'app.
async function newSoiree(name = "Samedi chez Alice"): Promise<Soiree> {
  await signInAs(alice);
  const { data, error } = await supabase.rpc("create_soiree", { soiree_name: name });
  if (error) throw error;
  assert.ok(data.join_token);
  return { id: data.id, joinToken: data.join_token, inviteCode: data.invite_code };
}

// Nouvel invité anonyme qui rejoint la soirée avec un pseudo.
async function guestJoins(soiree: Soiree, name = "Tom"): Promise<TestGuest> {
  const guest = await signInAsNewGuest();
  const { error } = await supabase.rpc("join_soiree", {
    token: soiree.joinToken,
    guest_name: name,
  });
  if (error) throw error;
  return guest;
}

async function chooseRestaurant(soiree: Soiree, name = "Kebab du coin") {
  await signInAs(alice);
  const { error } = await supabase.rpc("choose_restaurant", {
    target_group_id: soiree.id,
    restaurant_name: name,
  });
  if (error) throw error;
}

async function addItem(soiree: Soiree, label: string, quantity = 1, note: string | null = null) {
  const { data, error } = await supabase
    .from("order_items")
    .insert({ group_id: soiree.id, label, quantity, note })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function fetchItems(soiree: Soiree) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, label, quantity, note, profile_id")
    .eq("group_id", soiree.id)
    .order("created_at");
  if (error) throw error;
  return data;
}

async function step(soiree: Soiree) {
  await signInAs(alice);
  const { data, error } = await supabase
    .from("groups")
    .select("soiree_step, restaurant")
    .eq("id", soiree.id)
    .single();
  if (error) throw error;
  return data;
}

// Rejette avec le code SQL et, si donné, la clé stable (hint) que l'app reconnaîtra.
async function rejects(
  call: PromiseLike<{ error: { code: string; hint?: string } | null }>,
  code: string,
  hint?: string,
) {
  const { error } = await call;
  assert.ok(error, "une erreur était attendue");
  assert.equal(error.code, code);
  if (hint) assert.equal(error.hint, hint);
}

describe("créer et rejoindre une soirée", () => {
  test("la soirée naît à l'étape « choix », avec un lien de 22 caractères, son créateur en est membre", async () => {
    const soiree = await newSoiree();
    assert.match(soiree.joinToken, /^[A-Za-z0-9_-]{22}$/);
    const { data } = await supabase
      .from("group_members")
      .select("profile_id")
      .eq("group_id", soiree.id);
    assert.deepEqual(data, [{ profile_id: alice.id }]);
    assert.deepEqual(await step(soiree), { soiree_step: "choix", restaurant: null });
  });

  test("un invité rejoint avec un pseudo et un avatar : il est membre et voit les autres", async () => {
    const soiree = await newSoiree();
    const guest = await signInAsNewGuest();
    const { data: joinedId, error } = await supabase.rpc("join_soiree", {
      token: soiree.joinToken,
      guest_name: "  Tom ",
      guest_avatar: "pizza",
    });
    assert.equal(error, null);
    assert.equal(joinedId, soiree.id);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar")
      .order("display_name");
    assert.deepEqual(profiles, [
      { id: alice.id, display_name: "Alice", avatar: null },
      { id: guest.id, display_name: "Tom", avatar: "pizza" },
    ]);
  });

  test("rejoindre deux fois ne fait rien ; un vrai compte garde son nom", async () => {
    const soiree = await newSoiree();
    await signInAs(bea);
    for (let i = 0; i < 2; i++) {
      const { error } = await supabase.rpc("join_soiree", {
        token: soiree.joinToken,
        guest_name: "Pseudo ignoré",
      });
      assert.equal(error, null);
    }
    const { data } = await supabase.from("profiles").select("display_name").eq("id", bea.id);
    assert.deepEqual(data, [{ display_name: "Bea" }]);
    const { count } = await supabase
      .from("group_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("group_id", soiree.id);
    assert.equal(count, 2);
  });

  test("un invité sans pseudo, un lien inventé : refusés", async () => {
    const soiree = await newSoiree();
    await signInAsNewGuest();
    await rejects(
      supabase.rpc("join_soiree", { token: soiree.joinToken }),
      "22023",
      "name_required",
    );
    await rejects(
      supabase.rpc("join_soiree", { token: "AAAAAAAAAAAAAAAAAAAAAA", guest_name: "Tom" }),
      "P0002",
      "invalid_link",
    );
  });

  test("20 personnes au plus : la 21e est refusée", async () => {
    const soiree = await newSoiree();
    // Une par une : createUser numérote ses emails, en parallèle ils se répéteraient.
    const others: TestUser[] = [];
    for (let i = 0; i < 19; i++) others.push(await createUser(`Ami${i}`));
    await addMembersDirectly(soiree.id, others);
    await signInAsNewGuest();
    await rejects(
      supabase.rpc("join_soiree", { token: soiree.joinToken, guest_name: "Tom" }),
      "55000",
      "soiree_full",
    );
  });

  test("un non-membre ne voit ni la soirée ni ses membres", async () => {
    const soiree = await newSoiree();
    await guestJoins(soiree);
    await signInAs(dan);
    const { data: groups } = await supabase.from("groups").select("id").eq("id", soiree.id);
    assert.deepEqual(groups, []);
    const { data: members } = await supabase
      .from("group_members")
      .select("profile_id")
      .eq("group_id", soiree.id);
    assert.deepEqual(members, []);
  });
});

describe("un invité anonyme reste cantonné à sa soirée", () => {
  test("il ne crée ni groupe ni soirée et ne rejoint pas un foyer avec son code", async () => {
    const foyerId = await createGroup(alice, []);
    await signInAs(alice);
    const { data: foyer } = await supabase
      .from("groups")
      .select("invite_code")
      .eq("id", foyerId)
      .single();
    assert.ok(foyer);

    await signInAsNewGuest();
    await rejects(supabase.rpc("create_group", { group_name: "Pirate" }), "42501");
    await rejects(supabase.rpc("create_soiree", { soiree_name: "Pirate" }), "42501");
    await rejects(supabase.rpc("join_group", { code: foyer.invite_code }), "42501");
  });

  test("il ne voit pas les autres groupes de ses co-membres", async () => {
    const foyerId = await createGroup(alice, [bea]);
    const soiree = await newSoiree();
    await guestJoins(soiree);
    const { data } = await supabase.from("groups").select("id");
    assert.deepEqual(data, [{ id: soiree.id }]);
    const { data: hidden } = await supabase.from("groups").select("id").eq("id", foyerId);
    assert.deepEqual(hidden, []);
  });

  test("il propose et vote, mais ne lance pas de vote", async () => {
    const soiree = await newSoiree();
    const guest = await guestJoins(soiree);
    await signInAsGuest(guest);
    await assert.rejects(startSession(soiree.id));

    await signInAs(alice);
    const sessionId = await startSession(soiree.id);
    await signInAsGuest(guest);
    assert.equal(await addProposal(sessionId, "Pizza Roma"), true);
  });
});

describe("où on mange", () => {
  test("le responsable fixe le resto : la commande s'ouvre, une seule fois", async () => {
    const soiree = await newSoiree();
    await chooseRestaurant(soiree, "  Kebab du coin ");
    assert.deepEqual(await step(soiree), { soiree_step: "commande", restaurant: "Kebab du coin" });
    await rejects(
      supabase.rpc("choose_restaurant", { target_group_id: soiree.id, restaurant_name: "Autre" }),
      "55000",
      "step_mismatch",
    );
  });

  test("seul le responsable fixe le resto", async () => {
    const soiree = await newSoiree();
    await signInAs(bea);
    await supabase.rpc("join_soiree", { token: soiree.joinToken });
    await rejects(
      supabase.rpc("choose_restaurant", { target_group_id: soiree.id, restaurant_name: "Kebab" }),
      "P0002",
    );
  });

  test("pendant un vote, le resto ne se fixe pas à la main", async () => {
    const soiree = await newSoiree();
    await signInAs(alice);
    await startSession(soiree.id);
    await rejects(
      supabase.rpc("choose_restaurant", { target_group_id: soiree.id, restaurant_name: "Kebab" }),
      "55000",
      "vote_open",
    );
  });

  test("à la clôture du vote, le gagnant devient le resto ; plus de vote ensuite", async () => {
    const soiree = await newSoiree();
    const guest = await guestJoins(soiree);
    await signInAs(alice);
    const sessionId = await startSession(soiree.id);
    assert.equal(await addProposal(sessionId, "Kebab du coin"), true);
    assert.equal(await addProposal(sessionId, "Pizza Roma"), true);

    const { data: proposals } = await supabase
      .from("proposals")
      .select("id, name")
      .eq("session_id", sessionId);
    const pizza = proposals?.find((p) => p.name === "Pizza Roma");
    assert.ok(pizza);
    await setVote(pizza.id, true);
    await signInAsGuest(guest);
    await setVote(pizza.id, true);

    await signInAs(alice);
    await closeSession(sessionId);
    assert.deepEqual(await step(soiree), { soiree_step: "commande", restaurant: "Pizza Roma" });
    await assert.rejects(startSession(soiree.id));
  });
});

describe("la commande", () => {
  test("avant le choix du resto, aucune ligne", async () => {
    const soiree = await newSoiree();
    await signInAs(alice);
    await rejects(
      supabase.from("order_items").insert({ group_id: soiree.id, label: "Kebab" }),
      "55000",
      "ordering_closed",
    );
  });

  test("chacun ajoute et corrige ses lignes, tout le monde les voit", async () => {
    const soiree = await newSoiree();
    const guest = await guestJoins(soiree);
    await chooseRestaurant(soiree);

    await addItem(soiree, "Kebab sauce blanche");
    await signInAsGuest(guest);
    const tacos = await addItem(soiree, "Tacos XL", 1, "sans oignon");
    const { error } = await supabase.from("order_items").update({ quantity: 2 }).eq("id", tacos);
    assert.equal(error, null);

    await signInAs(alice);
    const items = await fetchItems(soiree);
    assert.deepEqual(
      items.map(({ label, quantity, note, profile_id }) => ({ label, quantity, note, profile_id })),
      [
        { label: "Kebab sauce blanche", quantity: 1, note: null, profile_id: alice.id },
        { label: "Tacos XL", quantity: 2, note: "sans oignon", profile_id: guest.id },
      ],
    );
  });

  test("personne n'écrit au nom d'un autre ni ne touche à sa ligne", async () => {
    const soiree = await newSoiree();
    const guest = await guestJoins(soiree);
    await chooseRestaurant(soiree);
    const aliceItem = await addItem(soiree, "Kebab");

    await signInAsGuest(guest);
    await rejects(
      supabase
        .from("order_items")
        .insert({ group_id: soiree.id, profile_id: alice.id, label: "10 kebabs" }),
      "42501",
    );
    const { data: updated } = await supabase
      .from("order_items")
      .update({ quantity: 10 })
      .eq("id", aliceItem)
      .select("id");
    assert.deepEqual(updated, []);
    const { data: deleted } = await supabase
      .from("order_items")
      .delete()
      .eq("id", aliceItem)
      .select("id");
    assert.deepEqual(deleted, []);
  });

  test("le responsable retire une ligne, ou une personne avec toutes ses lignes", async () => {
    const soiree = await newSoiree();
    const tom = await guestJoins(soiree, "Tom");
    const ines = await guestJoins(soiree, "Inès");
    await chooseRestaurant(soiree);
    await signInAsGuest(tom);
    const tomItem = await addItem(soiree, "Tacos");
    await signInAsGuest(ines);
    await addItem(soiree, "Assiette");
    await addItem(soiree, "Coca", 2);

    await signInAs(alice);
    const { data: deleted } = await supabase
      .from("order_items")
      .delete()
      .eq("id", tomItem)
      .select("id");
    assert.deepEqual(deleted, [{ id: tomItem }]);

    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", soiree.id)
      .eq("profile_id", ines.id);
    assert.equal(error, null);
    assert.deepEqual(await fetchItems(soiree), []);
  });

  test("un non-membre ne voit pas les lignes et n'en ajoute pas", async () => {
    const soiree = await newSoiree();
    await chooseRestaurant(soiree);
    await addItem(soiree, "Kebab");
    await signInAs(dan);
    assert.deepEqual(await fetchItems(soiree), []);
    // Refusé par le verrou (trigger BEFORE, avant la RLS), avec le message neutre.
    await rejects(
      supabase.from("order_items").insert({ group_id: soiree.id, label: "Kebab" }),
      "55000",
      "ordering_closed",
    );
  });

  test("une ligne vide ou une quantité hors de 1 à 20 est refusée", async () => {
    const soiree = await newSoiree();
    await chooseRestaurant(soiree);
    await rejects(
      supabase.from("order_items").insert({ group_id: soiree.id, label: "  " }),
      "23514",
    );
    await rejects(
      supabase.from("order_items").insert({ group_id: soiree.id, label: "Kebab", quantity: 0 }),
      "23514",
    );
    await rejects(
      supabase.from("order_items").insert({ group_id: soiree.id, label: "Kebab", quantity: 21 }),
      "23514",
    );
  });

  test("« Commande passée » : seul le responsable, puis tout est figé, lien compris", async () => {
    const soiree = await newSoiree();
    const guest = await guestJoins(soiree);
    await chooseRestaurant(soiree);
    await signInAsGuest(guest);
    const item = await addItem(soiree, "Tacos");
    await rejects(supabase.rpc("mark_ordered", { target_group_id: soiree.id }), "P0002");

    await signInAs(alice);
    const { error } = await supabase.rpc("mark_ordered", { target_group_id: soiree.id });
    assert.equal(error, null);
    assert.equal((await step(soiree)).soiree_step, "passee");
    await rejects(
      supabase.rpc("mark_ordered", { target_group_id: soiree.id }),
      "55000",
      "step_mismatch",
    );

    await signInAsGuest(guest);
    await rejects(
      supabase.from("order_items").insert({ group_id: soiree.id, label: "Coca" }),
      "55000",
      "ordering_closed",
    );
    await rejects(
      supabase.from("order_items").update({ quantity: 3 }).eq("id", item),
      "55000",
      "ordering_closed",
    );
    await rejects(supabase.from("order_items").delete().eq("id", item), "55000", "ordering_closed");
    assert.equal((await fetchItems(soiree)).length, 1);

    await signInAsNewGuest();
    await rejects(
      supabase.rpc("join_soiree", { token: soiree.joinToken, guest_name: "Retard" }),
      "55000",
      "soiree_closed",
    );
  });
});

// En dernier : la purge prend une heure de référence dans le futur et efface aussi les
// soirées des tests précédents de ce fichier (aucun autre fichier ne crée de soirée).
describe("purge", () => {
  test("24 h après la commande : soirée et invités effacés, vrais comptes gardés", async () => {
    const soiree = await newSoiree();
    const guest = await guestJoins(soiree);
    await signInAs(bea);
    await supabase.rpc("join_soiree", { token: soiree.joinToken });
    await chooseRestaurant(soiree);
    const { error } = await supabase.rpc("mark_ordered", { target_group_id: soiree.id });
    assert.equal(error, null);
    const orderedAt = await soireeOrderedAt(soiree.id);

    await purgeSoirees(new Date(orderedAt.getTime() + 23 * HOUR));
    assert.equal(await groupExists(soiree.id), true, "encore lisible 23 h après");
    assert.equal(await userExists(guest.id), true);

    assert.ok((await purgeSoirees(new Date(orderedAt.getTime() + 25 * HOUR))) >= 1);
    assert.equal(await groupExists(soiree.id), false);
    assert.equal(await userExists(guest.id), false);
    assert.equal(await userExists(bea.id), true);
    assert.equal(await userExists(alice.id), true);
  });

  test("une soirée abandonnée sans commande est effacée après 7 jours, un foyer jamais", async () => {
    const foyerId = await createGroup(alice, []);
    const soiree = await newSoiree();
    await purgeSoirees(new Date(Date.now() + 6 * 24 * HOUR));
    assert.equal(await groupExists(soiree.id), true);
    await purgeSoirees(new Date(Date.now() + 8 * 24 * HOUR));
    assert.equal(await groupExists(soiree.id), false);
    assert.equal(await groupExists(foyerId), true);
  });

  test("un invité qui vient de se connecter n'est pas effacé avant d'avoir rejoint", async () => {
    const guest = await signInAsNewGuest();
    await purgeSoirees(new Date());
    assert.equal(await userExists(guest.id), true);
  });
});
