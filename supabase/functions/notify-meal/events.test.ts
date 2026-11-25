import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMealMessages, mealDayBody, orderedBody, parseMealRequest } from "./events.ts";

const GROUP_ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";
const BRYAN = "00000000-0000-0000-0000-00000000000a";
const LEA = "00000000-0000-0000-0000-00000000000b";

test("parseMealRequest : commande passée et jour du repas", () => {
  assert.deepEqual(parseMealRequest({ group_id: GROUP_ID, kind: "ordered" }), {
    kind: "ordered",
    groupId: GROUP_ID,
  });
  assert.deepEqual(parseMealRequest({ group_id: GROUP_ID, kind: "meal_day" }), {
    kind: "meal_day",
    groupId: GROUP_ID,
  });
});

test("parseMealRequest : sans « kind », c'est un résumé", () => {
  const until = "2026-12-24T18:10:00+00:00";
  assert.deepEqual(parseMealRequest({ group_id: GROUP_ID, audience: "owner", since: null, until }), {
    kind: "digest",
    groupId: GROUP_ID,
    audience: "owner",
    since: null,
    until,
  });
});

test("parseMealRequest refuse tout le reste", () => {
  assert.equal(parseMealRequest(null), null);
  assert.equal(parseMealRequest({ group_id: GROUP_ID, kind: "deleted" }), null);
  assert.equal(parseMealRequest({ group_id: "pas-un-uuid", kind: "ordered" }), null);
  assert.equal(parseMealRequest({ group_id: GROUP_ID, kind: "digest" }), null);
});

test("orderedBody : « chez … », sans doubler un « Chez » déjà dans le nom", () => {
  assert.equal(orderedBody("Kebab Istanbul"), "C'est commandé chez Kebab Istanbul. Plus qu'à attendre !");
  assert.equal(orderedBody("Chez Momo"), "C'est commandé Chez Momo. Plus qu'à attendre !");
  assert.equal(orderedBody(null), "C'est commandé. Plus qu'à attendre !");
});

test("mealDayBody : ce que j'apporte, ou une invitation à le dire", () => {
  assert.equal(mealDayBody(["le vin", "le pain"]), "C'est aujourd'hui ! Tu apportes : le vin, le pain.");
  assert.equal(mealDayBody([]), "C'est aujourd'hui ! Dis ce que tu apportes.");
});

test("buildMealMessages : un message par téléphone, écrit pour chacun, le repas s'ouvre", () => {
  const messages = buildMealMessages(
    GROUP_ID,
    "Noël à Soultz",
    [
      { profileId: BRYAN, token: "ExponentPushToken[bryan]" },
      { profileId: LEA, token: "ExponentPushToken[lea]" },
      { profileId: LEA, token: "ExponentPushToken[lea]" },
    ],
    (profileId) => (profileId === LEA ? mealDayBody(["le vin"]) : mealDayBody([])),
  );
  assert.deepEqual(
    messages.map((message) => [message.to, message.body]),
    [
      ["ExponentPushToken[bryan]", "C'est aujourd'hui ! Dis ce que tu apportes."],
      ["ExponentPushToken[lea]", "C'est aujourd'hui ! Tu apportes : le vin."],
    ],
  );
  assert.equal(messages[0].title, "Noël à Soultz");
  assert.deepEqual(messages[0].data, { soireeId: GROUP_ID });
});
