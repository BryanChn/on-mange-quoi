import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMessages, parseNotifyRequest, type Recipient } from "./messages.ts";

const SESSION_ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";
const BRYAN = "00000000-0000-0000-0000-00000000000a";
const COMPAGNE = "00000000-0000-0000-0000-00000000000b";

const recipients: Recipient[] = [
  { profileId: BRYAN, token: "ExponentPushToken[telephoneBryan]" },
  { profileId: COMPAGNE, token: "ExponentPushToken[telephoneCompagne]" },
  { profileId: COMPAGNE, token: "ExponentPushToken[tabletteCompagne]" },
];

const base = {
  sessionId: SESSION_ID,
  groupName: "Famille",
  organizerId: BRYAN,
  organizerName: "Bryan",
  winnerName: null,
  recipients,
  participantIds: [] as string[],
};

const CHLOE = "00000000-0000-0000-0000-00000000000c";

test("parseNotifyRequest accepte un corps valide", () => {
  assert.deepEqual(parseNotifyRequest({ session_id: SESSION_ID, event: "opened" }), {
    sessionId: SESSION_ID,
    event: "opened",
  });
});

test("parseNotifyRequest refuse tout le reste", () => {
  assert.equal(parseNotifyRequest(null), null);
  assert.equal(parseNotifyRequest("texte"), null);
  assert.equal(parseNotifyRequest({ session_id: "pas-un-uuid", event: "opened" }), null);
  assert.equal(parseNotifyRequest({ session_id: SESSION_ID, event: "deleted" }), null);
  assert.deepEqual(parseNotifyRequest({ session_id: SESSION_ID, event: "reminder" }), {
    sessionId: SESSION_ID,
    event: "reminder",
  });
  assert.equal(parseNotifyRequest({ session_id: SESSION_ID }), null);
});

test("lancement : tous les téléphones des autres membres, pas ceux de l'organisateur", () => {
  const messages = buildMessages({ ...base, event: "opened" });
  assert.deepEqual(
    messages.map((message) => message.to),
    ["ExponentPushToken[telephoneCompagne]", "ExponentPushToken[tabletteCompagne]"],
  );
  assert.equal(messages[0].title, "Famille");
  assert.equal(messages[0].body, "Bryan a lancé un vote : propose et vote !");
  assert.deepEqual(messages[0].data, { sessionId: SESSION_ID });
});

test("lancement par un compte supprimé : tout le monde est prévenu, sans nom", () => {
  const messages = buildMessages({ ...base, event: "opened", organizerId: null, organizerName: null });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].body, "Quelqu'un a lancé un vote : propose et vote !");
});

test("résultat : tout le groupe, organisateur compris", () => {
  const messages = buildMessages({ ...base, event: "closed", winnerName: "Pizza" });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].body, "C'est décidé : Pizza. Bon appétit !");
});

test("résultat sans plat gagnant connu : pas de « Bon appétit » sur rien", () => {
  const messages = buildMessages({ ...base, event: "closed", winnerName: null });
  assert.equal(messages[0].body, "Le vote est terminé.");
});

test("un jeton en double ne sonne qu'une fois", () => {
  const messages = buildMessages({
    ...base,
    event: "closed",
    winnerName: "Pizza",
    recipients: [...recipients, recipients[0]],
  });
  assert.equal(messages.length, 3);
});

test("rappel : seulement les membres qui n'ont ni proposé ni voté, jamais l'organisateur", () => {
  const withChloe: Recipient[] = [
    ...recipients,
    { profileId: CHLOE, token: "ExponentPushToken[telephoneChloe]" },
  ];
  // La compagne a voté : seule Chloé est relancée (Bryan a lancé le vote).
  const messages = buildMessages({
    ...base,
    event: "reminder",
    recipients: withChloe,
    participantIds: [COMPAGNE],
  });
  assert.deepEqual(
    messages.map((message) => message.to),
    ["ExponentPushToken[telephoneChloe]"],
  );
  assert.equal(messages[0].body, "Le vote t'attend : propose un plat ou coche ce qui te tente.");
  assert.deepEqual(messages[0].data, { sessionId: SESSION_ID });
});

test("rappel : tout le monde a participé, aucun envoi", () => {
  const messages = buildMessages({ ...base, event: "reminder", participantIds: [COMPAGNE] });
  assert.equal(messages.length, 0);
});
