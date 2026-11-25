import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMessages, menuIfLast, parseNotifyRequest, type MenuVote, type Recipient } from "./messages.ts";

const SESSION_ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";
const BRYAN = "00000000-0000-0000-0000-00000000000a";
const COMPAGNE = "00000000-0000-0000-0000-00000000000b";

const recipients: Recipient[] = [
  { profileId: BRYAN, token: "ExponentPushToken[telephoneBryan]" },
  { profileId: COMPAGNE, token: "ExponentPushToken[telephoneCompagne]" },
  { profileId: COMPAGNE, token: "ExponentPushToken[tabletteCompagne]" },
];

const base: Omit<Parameters<typeof buildMessages>[0], "event"> = {
  sessionId: SESSION_ID,
  groupName: "Famille",
  mealMode: null,
  topic: "plat",
  menu: null,
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
  assert.equal(messages[0].body, "Bryan lance le vote : on mange quoi ?");
  assert.deepEqual(messages[0].data, { sessionId: SESSION_ID });
});

test("lancement par un compte supprimé : tout le monde est prévenu, sans nom", () => {
  const messages = buildMessages({ ...base, event: "opened", organizerId: null, organizerName: null });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].body, "Quelqu'un lance le vote : on mange quoi ?");
});

test("résultat : tout le groupe, organisateur compris", () => {
  const messages = buildMessages({ ...base, event: "closed", winnerName: "Pizza" });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].body, "C'est décidé : Pizza. Bon appétit !");
});

test("résultat sans plat gagnant connu : pas de « Bon appétit » sur rien", () => {
  const messages = buildMessages({ ...base, event: "closed", winnerName: null });
  assert.equal(messages[0].body, "Le vote est terminé : viens voir le résultat.");
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

// ─── Repas à plusieurs ──────────────────────────────────

const repas = { ...base, groupName: "Noël à Soultz" };

test("repas « commande » : le vote parle du resto, puis de la commande", () => {
  const commande = { ...repas, mealMode: "commande" as const, topic: "resto" as const };
  assert.equal(
    buildMessages({ ...commande, event: "opened" })[0].body,
    "Bryan lance le vote : où on mange ?",
  );
  assert.equal(
    buildMessages({ ...commande, event: "closed", winnerName: "Kebab Istanbul" })[0].body,
    "C'est décidé : Kebab Istanbul. Écris ta commande.",
  );
  assert.equal(
    buildMessages({ ...commande, event: "reminder" })[0].body,
    "Le vote t'attend : propose un resto ou coche ce qui te tente.",
  );
});

test("repas « resto » : « on va chez … », sans doubler un « Chez » déjà dans le nom", () => {
  const resto = { ...repas, mealMode: "resto" as const, topic: "resto" as const, event: "closed" as const };
  assert.equal(buildMessages({ ...resto, winnerName: "Pizza Roma" })[0].body, "C'est décidé : on va chez Pizza Roma.");
  assert.equal(buildMessages({ ...resto, winnerName: "Chez Momo" })[0].body, "C'est décidé : on va Chez Momo.");
});

test("repas « maison » : chaque sujet a sa question au lancement", () => {
  const maison = { ...repas, mealMode: "maison" as const, event: "opened" as const };
  assert.equal(buildMessages({ ...maison, topic: "dessert" })[0].body, "Bryan lance le vote : quel dessert ?");
  assert.equal(buildMessages({ ...maison, topic: "entree" })[0].body, "Bryan lance le vote : quelle entrée ?");
  assert.equal(buildMessages({ ...maison, topic: "apero" })[0].body, "Bryan lance le vote : quel apéro ?");
});

test("repas « maison » : rien tant que le menu n'est pas complet", () => {
  const messages = buildMessages({
    ...repas,
    mealMode: "maison",
    topic: "apero",
    event: "closed",
    winnerName: "Chips",
    menu: null,
  });
  assert.equal(messages.length, 0);
});

test("repas « maison » : le dernier vote annonce tout le menu, à tout le monde", () => {
  const messages = buildMessages({
    ...repas,
    mealMode: "maison",
    topic: "dessert",
    event: "closed",
    winnerName: "Tiramisu",
    menu: [
      { topic: "apero", winnerName: "Chips" },
      { topic: "dessert", winnerName: "Tiramisu" },
    ],
  });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].body, "Le menu est décidé. Apéro : Chips. Dessert : Tiramisu.");
});

test("repas « maison » : un seul rappel, qui parle du menu", () => {
  const messages = buildMessages({ ...repas, mealMode: "maison", topic: "apero", event: "reminder" });
  assert.equal(messages[0].body, "Le menu t'attend : propose ou coche ce qui te tente.");
});

const APERO = "11111111-1111-4111-8111-111111111111";
const DESSERT = "22222222-2222-4222-8222-222222222222";

function menuVote(id: string, overrides: Partial<MenuVote>): MenuVote {
  return { id, topic: "plat", status: "closed", closedAt: null, winnerName: null, ...overrides };
}

test("menuIfLast : rien tant qu'un vote du menu est ouvert", () => {
  const votes = [
    menuVote(APERO, { topic: "apero", closedAt: "2026-12-24T18:00:00Z", winnerName: "Chips" }),
    menuVote(DESSERT, { topic: "dessert", status: "open" }),
  ];
  assert.equal(menuIfLast(votes, APERO), null);
});

test("menuIfLast : seul le dernier vote terminé annonce le menu, dans l'ordre du repas", () => {
  // Le dessert est terminé avant l'apéro : l'apéro annonce, le menu commence par l'apéro.
  const votes = [
    menuVote(DESSERT, { topic: "dessert", closedAt: "2026-12-24T18:00:00Z", winnerName: "Tiramisu" }),
    menuVote(APERO, { topic: "apero", closedAt: "2026-12-24T18:05:00Z", winnerName: "Chips" }),
  ];
  assert.equal(menuIfLast(votes, DESSERT), null);
  assert.deepEqual(menuIfLast(votes, APERO), [
    { topic: "apero", winnerName: "Chips" },
    { topic: "dessert", winnerName: "Tiramisu" },
  ]);
});

test("menuIfLast : deux votes terminés au même instant, un seul annonce", () => {
  const sameTime = "2026-12-24T18:00:00Z";
  const votes = [
    menuVote(APERO, { topic: "apero", closedAt: sameTime, winnerName: "Chips" }),
    menuVote(DESSERT, { topic: "dessert", closedAt: sameTime, winnerName: "Tiramisu" }),
  ];
  const announcing = [APERO, DESSERT].filter((id) => menuIfLast(votes, id) !== null);
  assert.deepEqual(announcing, [DESSERT]);
});
