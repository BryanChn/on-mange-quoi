import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMessages,
  chunk,
  parseNotifyRequest,
  safeEqual,
  tokensToForget,
  type ExpoMessage,
  type Recipient,
} from "./messages.ts";

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
};

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
  assert.equal(parseNotifyRequest({ session_id: SESSION_ID }), null);
});

test("safeEqual compare sans se tromper, longueurs différentes comprises", () => {
  assert.equal(safeEqual("secret-123", "secret-123"), true);
  assert.equal(safeEqual("secret-123", "secret-124"), false);
  assert.equal(safeEqual("secret", "secret-123"), false);
  assert.equal(safeEqual("", "secret"), false);
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
  assert.equal(messages[0].body, "C'est réglé : Pizza");
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

test("chunk découpe en paquets de taille maximale", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 100), []);
});

test("tokensToForget ne garde que les DeviceNotRegistered, dans l'ordre de l'envoi", () => {
  const messages = buildMessages({ ...base, event: "closed", winnerName: "Pizza" });
  const forgotten = tokensToForget(messages, [
    { status: "ok", id: "a" },
    { status: "error", message: "mort", details: { error: "DeviceNotRegistered" } },
    { status: "error", message: "trop vite", details: { error: "MessageRateExceeded" } },
  ]);
  assert.deepEqual(forgotten, ["ExponentPushToken[telephoneCompagne]"]);
});

test("tokensToForget ignore un ticket sans message correspondant", () => {
  const messages: ExpoMessage[] = [];
  assert.deepEqual(
    tokensToForget(messages, [{ status: "error", message: "x", details: { error: "DeviceNotRegistered" } }]),
    [],
  );
});
