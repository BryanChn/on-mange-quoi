import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDigestMessages,
  digestBody,
  listNames,
  parseDigestRequest,
  recipientsFor,
  type Arrival,
  type Contribution,
  type Recipient,
} from "./digest.ts";

const GROUP_ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";
const BRYAN = "00000000-0000-0000-0000-00000000000a";
const LEA = "00000000-0000-0000-0000-00000000000b";
const TOM = "00000000-0000-0000-0000-00000000000c";

const lea: Arrival = { profileId: LEA, name: "Léa" };
const tom: Arrival = { profileId: TOM, name: "Tom" };
const leaBrings = (label: string): Contribution => ({ profileId: LEA, name: "Léa", label });
const tomBrings = (label: string): Contribution => ({ profileId: TOM, name: "Tom", label });

test("parseDigestRequest accepte la fenêtre et le destinataire, premier résumé compris", () => {
  const until = "2026-12-24T18:10:00+00:00";
  assert.deepEqual(parseDigestRequest({ group_id: GROUP_ID, audience: "owner", since: null, until }), {
    groupId: GROUP_ID,
    audience: "owner",
    since: null,
    until,
  });
  assert.deepEqual(
    parseDigestRequest({
      group_id: GROUP_ID,
      audience: "others",
      since: "2026-12-24T17:00:00+00:00",
      until,
    }),
    { groupId: GROUP_ID, audience: "others", since: "2026-12-24T17:00:00+00:00", until },
  );
});

test("parseDigestRequest refuse tout le reste", () => {
  const until = "2026-12-24T18:10:00+00:00";
  const ok = { group_id: GROUP_ID, audience: "owner", since: null, until };
  assert.equal(parseDigestRequest(null), null);
  assert.equal(parseDigestRequest({ ...ok, group_id: "pas-un-uuid" }), null);
  assert.equal(parseDigestRequest({ ...ok, audience: undefined }), null);
  assert.equal(parseDigestRequest({ ...ok, audience: "tous" }), null);
  assert.equal(parseDigestRequest({ ...ok, until: undefined }), null);
  assert.equal(parseDigestRequest({ ...ok, until: "demain" }), null);
  assert.equal(parseDigestRequest({ ...ok, since: 12 }), null);
});

test("recipientsFor : l'organisateur seul, ou tous sauf lui", () => {
  const all: Recipient[] = [
    { profileId: BRYAN, token: "ExponentPushToken[bryan]" },
    { profileId: LEA, token: "ExponentPushToken[lea]" },
    { profileId: TOM, token: "ExponentPushToken[tom]" },
  ];
  assert.deepEqual(
    recipientsFor("owner", BRYAN, all).map((recipient) => recipient.profileId),
    [BRYAN],
  );
  assert.deepEqual(
    recipientsFor("others", BRYAN, all).map((recipient) => recipient.profileId),
    [LEA, TOM],
  );
});

test("listNames : nommer jusqu'à 3, compter au-delà", () => {
  assert.equal(listNames(["Léa"]), "Léa");
  assert.equal(listNames(["Léa", "Tom"]), "Léa et Tom");
  assert.equal(listNames(["Léa", "Tom", "Max"]), "Léa, Tom et Max");
  assert.equal(listNames(["Léa", "Tom", "Max", "Zoé"]), "Léa, Tom et 2 autres");
});

test("arrivées : singulier et pluriel", () => {
  assert.equal(digestBody([lea], [], BRYAN), "Léa a rejoint.");
  assert.equal(digestBody([lea, tom], [], BRYAN), "Léa et Tom ont rejoint.");
});

test("apports : une phrase par personne, dans l'ordre", () => {
  assert.equal(
    digestBody([lea, tom], [leaBrings("le pain"), tomBrings("le vin"), leaBrings("le fromage")], BRYAN),
    "Léa et Tom ont rejoint. Léa apporte : le pain, le fromage. Tom apporte : le vin.",
  );
});

test("apports : au-delà de 3 personnes, on compte", () => {
  const people = ["A", "B", "C", "D", "E"].map((name, index) => ({
    profileId: `00000000-0000-0000-0000-00000000010${index}`,
    name,
    label: "les chips",
  }));
  assert.equal(
    digestBody([], people, BRYAN),
    "A apporte : les chips. B apporte : les chips. C apporte : les chips. Et 2 autres personnes apportent quelque chose.",
  );
  assert.equal(
    digestBody([], people.slice(0, 4), BRYAN),
    "A apporte : les chips. B apporte : les chips. C apporte : les chips. Et une autre personne apporte quelque chose.",
  );
});

test("chacun lit ce que les autres ont fait, jamais sa propre arrivée", () => {
  assert.equal(digestBody([lea, tom], [leaBrings("le pain")], LEA), "Tom a rejoint.");
  assert.equal(digestBody([lea], [leaBrings("le pain")], LEA), null);
});

test("messages : un par téléphone, rien pour qui n'a rien de neuf, le repas s'ouvre au toucher", () => {
  const recipients: Recipient[] = [
    { profileId: BRYAN, token: "ExponentPushToken[bryan]" },
    { profileId: LEA, token: "ExponentPushToken[lea]" },
    { profileId: TOM, token: "ExponentPushToken[tom]" },
    { profileId: TOM, token: "ExponentPushToken[tom]" },
  ];
  const messages = buildDigestMessages({
    groupId: GROUP_ID,
    groupName: "Noël à Soultz",
    arrivals: [lea],
    contributions: [leaBrings("le pain")],
    recipients,
  });
  assert.deepEqual(
    messages.map((message) => [message.to, message.body]),
    [
      ["ExponentPushToken[bryan]", "Léa a rejoint. Léa apporte : le pain."],
      ["ExponentPushToken[tom]", "Léa a rejoint. Léa apporte : le pain."],
    ],
  );
  assert.equal(messages[0].title, "Noël à Soultz");
  assert.deepEqual(messages[0].data, { soireeId: GROUP_ID });
});
