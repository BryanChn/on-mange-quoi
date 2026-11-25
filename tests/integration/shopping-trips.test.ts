// « Je pars faire les courses » (migration shopping_trips) sur la base locale : partir,
// l'annonce et ses garde-fous, les ajouts qui attendent celui qui fait les courses, « J'ai
// fini ». Les messages (notify-shopping) sont testés à part (messages.test.ts) ; ici, sans
// Vault, call_edge_function ne part pas.
//
// Rôles : Alice fait les courses, Bea partage le foyer, Dan n'en fait pas partie.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createGroup as createFoyer } from "../../src/lib/groups.ts";
import {
  addShoppingItem,
  endShoppingTrip,
  fetchActiveTrips,
  startShoppingTrip,
} from "../../src/lib/shopping.ts";
import {
  cleanUp,
  createGroup,
  createUser,
  sendShoppingAdditions,
  shoppingTrips,
  signInAs,
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

// Le départ n'est pas annoncé la nuit (22 h à 8 h, Paris) : l'attendu dépend de l'heure du test.
function isDaytimeInParis(): boolean {
  // « 13 », sans le « h » qu'ajoute le format français.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Paris",
    }).format(new Date()),
  );
  return hour >= 8 && hour < 22;
}

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000);

describe("partir faire les courses", () => {
  test("seul dans son foyer : personne à prévenir, refusé", async () => {
    await signInAs(alice);
    const soloId = await createFoyer("Solo");
    await assert.rejects(startShoppingTrip(soloId));
  });

  test("le foyer voit qui est aux courses ; deux touchers, un seul passage", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const first = await startShoppingTrip(foyerId);
    const second = await startShoppingTrip(foyerId);
    assert.equal(first.isAnnounced, isDaytimeInParis());
    assert.equal(second.isAnnounced, first.isAnnounced);
    assert.equal((await shoppingTrips(foyerId)).length, 1);

    await signInAs(bea);
    const trips = await fetchActiveTrips(foyerId);
    assert.deepEqual(
      trips.map((trip) => trip.shopperId),
      [alice.id],
    );
  });

  test("repartir moins de 30 min après une annonce : pas de nouvelle annonce", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    await startShoppingTrip(foyerId);
    await endShoppingTrip(foyerId);
    const again = await startShoppingTrip(foyerId);
    assert.equal(again.isAnnounced, false);
    assert.equal((await shoppingTrips(foyerId)).length, 2);
  });

  test("hors du foyer : rien à voir, impossible de partir", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    await startShoppingTrip(foyerId);

    await signInAs(dan);
    assert.deepEqual(await fetchActiveTrips(foyerId), []);
    await assert.rejects(startShoppingTrip(foyerId));
  });
});

describe("ce que le foyer ajoute pendant les courses", () => {
  test("l'ajout de Bea attend Alice, puis part 30 s après", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    await startShoppingTrip(foyerId);

    await signInAs(bea);
    await addShoppingItem(foyerId, { label: "Lait", quantity: "2" });
    assert.notEqual((await shoppingTrips(foyerId))[0].addedPendingSince, null);

    await sendShoppingAdditions(inSeconds(10));
    assert.notEqual((await shoppingTrips(foyerId))[0].addedPendingSince, null);

    assert.ok((await sendShoppingAdditions(inSeconds(31))) >= 1);
    const [trip] = await shoppingTrips(foyerId);
    assert.equal(trip.addedPendingSince, null);
    assert.notEqual(trip.addedSentAt, null);
  });

  test("ce qu'Alice ajoute elle-même ne la prévient pas", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    await startShoppingTrip(foyerId);
    await addShoppingItem(foyerId, { label: "Pain", quantity: "" });
    assert.equal((await shoppingTrips(foyerId))[0].addedPendingSince, null);
  });

  test("« J'ai fini » : plus personne aux courses, les ajouts ne préviennent plus", async () => {
    const foyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    await startShoppingTrip(foyerId);
    await endShoppingTrip(foyerId);

    await signInAs(bea);
    assert.deepEqual(await fetchActiveTrips(foyerId), []);
    await addShoppingItem(foyerId, { label: "Beurre", quantity: "" });
    assert.equal((await shoppingTrips(foyerId))[0].addedPendingSince, null);
  });
});
