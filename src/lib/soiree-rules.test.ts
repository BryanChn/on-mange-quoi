import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultSoireeName,
  goingTo,
  inviteMessage,
  namesWithoutOrder,
  orderText,
  recapPeople,
  SOIREE_NAME_MAX_LENGTH,
  summarizeOrder,
  toJoinFailure,
} from "./soiree-rules.ts";

test("le nom proposé est le jour d'aujourd'hui chez le prénom", () => {
  // 28 novembre 2026 : un samedi.
  assert.equal(defaultSoireeName(new Date(2026, 10, 28, 19), "Bryan"), "Samedi chez Bryan");
  assert.equal(defaultSoireeName(new Date(2026, 10, 23, 12), "  Léa "), "Lundi chez Léa");
});

test("sans prénom, un nom neutre ; un prénom trop long est coupé à la limite de la colonne", () => {
  assert.equal(defaultSoireeName(new Date(2026, 10, 28), " "), "Repas de samedi");
  const long = defaultSoireeName(new Date(2026, 10, 28), "A".repeat(60));
  assert.equal(long.length, SOIREE_NAME_MAX_LENGTH);
});

test("les erreurs de join_soiree sont reconnues par leur hint, les autres non", () => {
  assert.equal(toJoinFailure({ code: "55000", hint: "soiree_full" }), "soiree_full");
  assert.equal(toJoinFailure({ code: "P0002", hint: "invalid_link" }), "invalid_link");
  assert.equal(toJoinFailure({ code: "55000", hint: "session_closed" }), null);
  assert.equal(toJoinFailure(new Error("réseau")), null);
  assert.equal(toJoinFailure(null), null);
});

const names: Record<string, string> = { a: "Alice", t: "Tom", i: "Inès" };
const nameOf = (id: string) => names[id] ?? "?";

test("récap : les lignes identiques s'additionnent, majuscules et espaces ignorés", () => {
  const lines = summarizeOrder(
    [
      { profileId: "a", label: "Kebab sauce blanche", quantity: 1, note: null },
      { profileId: "t", label: "kebab  Sauce blanche ", quantity: 2, note: "" },
      { profileId: "i", label: "Tacos XL", quantity: 1, note: null },
    ],
    nameOf,
  );
  assert.deepEqual(lines, [
    { label: "Kebab sauce blanche", note: null, quantity: 3, people: ["Alice", "Tom (2)"] },
    { label: "Tacos XL", note: null, quantity: 1, people: ["Inès"] },
  ]);
});

test("récap : une remarque différente fait une ligne à part", () => {
  const lines = summarizeOrder(
    [
      { profileId: "a", label: "Kebab", quantity: 1, note: null },
      { profileId: "i", label: "Kebab", quantity: 1, note: " sans  oignon" },
      { profileId: "t", label: "kebab", quantity: 1, note: "Sans oignon" },
    ],
    nameOf,
  );
  assert.deepEqual(lines, [
    { label: "Kebab", note: "sans oignon", quantity: 2, people: ["Inès", "Tom"] },
    { label: "Kebab", note: null, quantity: 1, people: ["Alice"] },
  ]);
});

test("qui prend quoi : une ligne par personne, ses lignes identiques additionnées", () => {
  const people = recapPeople(
    [
      { profileId: "t", label: "Kebab", quantity: 1, note: null },
      { profileId: "b", label: "Frites", quantity: 1, note: "sans sel" },
      { profileId: "t", label: "Frites", quantity: 1, note: null },
      { profileId: "b", label: " frites ", quantity: 1, note: "Sans  sel" },
    ],
    (id) => (id === "t" ? "Tom" : "Bryan"),
  );
  assert.deepEqual(people, [
    { name: "Tom", items: "Kebab, Frites" },
    { name: "Bryan", items: "2× Frites (sans sel)" },
  ]);
});

const momoLines = [
  { label: "Kebab", note: null, quantity: 3, people: [] },
  { label: "Tacos XL", note: "sans oignon", quantity: 1, people: [] },
];
const momoPeople = [
  { name: "Bryan", items: "2× Kebab" },
  { name: "Léa", items: "Kebab, Tacos XL (sans oignon)" },
];

test("récap en texte, commande passée : comptoir sans noms, puis qui prend quoi", () => {
  const text = orderText({
    restaurant: "Chez Momo",
    isOrdered: true,
    lines: momoLines,
    people: momoPeople,
    waiting: [],
    joinUrl: "https://exemple.test/rejoindre/abc",
  });
  assert.equal(
    text,
    [
      "*Chez Momo* · commande passée ✅",
      "4 articles · 2 personnes",
      "",
      "*Pour le comptoir*",
      "3× Kebab",
      "1× Tacos XL _(sans oignon)_",
      "",
      "*Qui prend quoi*",
      "Bryan : 2× Kebab",
      "Léa : Kebab, Tacos XL (sans oignon)",
      "",
      "Organisé avec On mange quoi ?",
    ].join("\n"),
  );
});

test("récap en texte, commande ouverte : qui manque, et le lien pour commander", () => {
  const text = orderText({
    restaurant: "Chez Momo",
    isOrdered: false,
    lines: momoLines,
    people: momoPeople,
    waiting: ["Tom", "Inès"],
    joinUrl: "https://exemple.test/rejoindre/abc",
  });
  assert.match(text, /^\*Chez Momo\* · commande ouverte\n4 articles · 2 personnes sur 4\n/);
  assert.match(
    text,
    /\n\nPas encore commandé : Tom, Inès\nPour commander : https:\/\/exemple\.test\/rejoindre\/abc\n\nOrganisé avec On mange quoi \?$/,
  );
});

test("récap en texte : pas de lien si personne n'attend, singulier pour un seul article", () => {
  const text = orderText({
    restaurant: null,
    isOrdered: false,
    lines: [{ label: "Kebab", note: null, quantity: 1, people: [] }],
    people: [{ name: "Tom", items: "Kebab" }],
    waiting: [],
    joinUrl: "https://exemple.test/rejoindre/abc",
  });
  assert.match(text, /^\*Commande\* · commande ouverte\n1 article · 1 personne\n/);
  assert.doesNotMatch(text, /Pour commander|Pas encore/);
});

test("qui n'a encore rien commandé", () => {
  const members = [
    { id: "a", name: "Alice" },
    { id: "t", name: "Tom" },
    { id: "i", name: "Inès" },
  ];
  assert.deepEqual(
    namesWithoutOrder(members, [{ profileId: "t", label: "Tacos", quantity: 1, note: null }]),
    ["Alice", "Inès"],
  );
});

test("le message d'invitation dit ce qu'on attend de l'invité, selon le repas", () => {
  const url = "https://exemple.test/rejoindre/abc";
  assert.equal(
    inviteMessage("maison", "Noël à Soultz", url, "HPE6QPJA"),
    `On prépare « Noël à Soultz » ! Vote le menu et dis ce que tu apportes, pas besoin de l’app : ${url}\nTu as l’app ? Code : HPE6QPJA`,
  );
  assert.match(inviteMessage("commande", "Kebab", url, "X"), /^On commande pour « Kebab » !/);
  assert.match(
    inviteMessage("resto", "Samedi", url, "X"),
    /^On choisit le resto pour « Samedi » !/,
  );
});

test("le resto choisi : pas de « chez Chez Momo »", () => {
  assert.equal(goingTo("Pizza Roma"), "On va chez Pizza Roma");
  assert.equal(goingTo("Chez Momo"), "On va Chez Momo");
  assert.equal(goingTo(" chez momo "), "On va chez momo");
  assert.equal(goingTo("Chezmoi Burger"), "On va chez Chezmoi Burger");
});
