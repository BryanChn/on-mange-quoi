import assert from "node:assert/strict";
import { test } from "node:test";

import { addedBody, buildShoppingMessages, parseShoppingRequest, startedBody } from "./messages.ts";

const TRIP_ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";
const GROUP_ID = "7f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";

test("parseShoppingRequest : un départ, des ajouts avec leur fenêtre", () => {
  assert.deepEqual(parseShoppingRequest({ trip_id: TRIP_ID, kind: "started" }), {
    kind: "started",
    tripId: TRIP_ID,
  });
  const since = "2026-11-25T17:00:00+00:00";
  const until = "2026-11-25T17:01:00+00:00";
  assert.deepEqual(parseShoppingRequest({ trip_id: TRIP_ID, kind: "added", since, until }), {
    kind: "added",
    tripId: TRIP_ID,
    since,
    until,
  });
});

test("parseShoppingRequest refuse tout le reste", () => {
  assert.equal(parseShoppingRequest(null), null);
  assert.equal(parseShoppingRequest({ trip_id: "x", kind: "started" }), null);
  assert.equal(parseShoppingRequest({ trip_id: TRIP_ID, kind: "ended" }), null);
  assert.equal(parseShoppingRequest({ trip_id: TRIP_ID, kind: "added" }), null);
  assert.equal(
    parseShoppingRequest({ trip_id: TRIP_ID, kind: "added", since: "hier", until: "demain" }),
    null,
  );
});

test("startedBody : qui part, et ce qu'on peut faire", () => {
  assert.equal(
    startedBody("Bryan"),
    "Bryan part faire les courses. Besoin de quelque chose ? Ajoute-le à la liste.",
  );
});

test("addedBody : les articles, avec leur quantité", () => {
  assert.equal(
    addedBody([
      { label: "Lait", quantity: "2" },
      { label: "Œufs", quantity: null },
    ]),
    "À prendre aussi : Lait (2), Œufs.",
  );
  assert.equal(addedBody([]), null);
});

test("buildShoppingMessages : un par téléphone, la liste s'ouvre au toucher", () => {
  const messages = buildShoppingMessages(
    GROUP_ID,
    "Famille",
    [
      { profileId: "a", token: "ExponentPushToken[a]" },
      { profileId: "a", token: "ExponentPushToken[a]" },
      { profileId: "b", token: "ExponentPushToken[b]" },
    ],
    "À prendre aussi : Lait.",
  );
  assert.equal(messages.length, 2);
  assert.equal(messages[0].title, "Famille");
  assert.deepEqual(messages[0].data, { coursesGroupId: GROUP_ID });
});
