import assert from "node:assert/strict";
import { test } from "node:test";

import { getInitial, pickAvatarColor } from "./avatar.ts";
import {
  dayLabel,
  formatTime,
  groupSubtitle,
  leadingTitle,
  pickTonight,
  summarizeParticipation,
  voteProgressLabel,
  type ClosedHomeSession,
  type HomeGroup,
  type OpenHomeSession,
} from "./tonight.ts";

const ME = "me";
const members = [
  { id: ME, name: "Bryan" },
  { id: "c", name: "Camille" },
  { id: "l", name: "Léa" },
];
// Jeudi 12 novembre 2026, 19 h, heure du téléphone.
const now = new Date(2026, 10, 12, 19, 0);
const at = (day: number, hour = 18) => new Date(2026, 10, day, hour, 0).toISOString();

function group(id: string, latestSession: HomeGroup["latestSession"]): HomeGroup {
  return { id, name: `Groupe ${id}`, members, latestSession };
}
function open(id: string, createdAt: string, voterIds: string[] = []): OpenHomeSession {
  return { id, isOpen: true, createdAt, proposals: [], voterIds };
}
function closed(id: string, closedAt: string, winnerName = "Pizza"): ClosedHomeSession {
  return { id, isOpen: false, closedAt, winnerName };
}

test("getInitial : première lettre en majuscule, espaces ignorés, nom vide", () => {
  assert.equal(getInitial("bryan"), "B");
  assert.equal(getInitial("  léa"), "L");
  assert.equal(getInitial(""), "?");
  assert.equal(getInitial("   "), "?");
});

test("pickAvatarColor : stable pour un même nom, toujours dans la palette", () => {
  const palette = ["a", "b", "c"];
  assert.equal(pickAvatarColor("Camille", palette), pickAvatarColor("Camille", palette));
  for (const name of ["", "B", "Bryan", "Léa", "Maman"]) {
    assert.ok(palette.includes(pickAvatarColor(name, palette)));
  }
});

test("formatTime : deux chiffres pour les heures et les minutes", () => {
  assert.equal(formatTime(new Date(2026, 0, 1, 7, 5)), "07:05");
  assert.equal(formatTime(new Date(2026, 0, 1, 18, 42)), "18:42");
});

test("dayLabel : ce soir, jour de la semaine, puis date", () => {
  assert.equal(dayLabel(new Date(at(12, 13)), now), "ce soir");
  assert.equal(dayLabel(new Date(at(10)), now), "mardi");
  assert.equal(dayLabel(new Date(at(1)), now), "le 01/11");
});

test("leadingTitle : aucun plat, aucun vote, un plat en tête, égalités", () => {
  assert.equal(leadingTitle([]), "Aucun plat proposé");
  assert.equal(leadingTitle([{ name: "Pizza", voteCount: 0 }]), "Personne n’a encore voté");
  assert.equal(
    leadingTitle([
      { name: "Bolognaise", voteCount: 2 },
      { name: "Pizza", voteCount: 1 },
    ]),
    "Bolognaise en tête",
  );
  assert.equal(
    leadingTitle([
      { name: "Pizza", voteCount: 1 },
      { name: "Curry", voteCount: 1 },
    ]),
    "Pizza et Curry à égalité",
  );
  assert.equal(
    leadingTitle([
      { name: "A", voteCount: 1 },
      { name: "B", voteCount: 1 },
      { name: "C", voteCount: 1 },
    ]),
    "3 plats à égalité",
  );
});

test("summarizeParticipation : qui a voté et qui on attend", () => {
  assert.deepEqual(summarizeParticipation(members, [ME, "c"], ME), {
    votedCount: 2,
    memberCount: 3,
    pendingLabel: "Léa n’a pas encore voté",
  });
  assert.equal(
    summarizeParticipation(members, [], ME).pendingLabel,
    "Camille et 1 autre n’ont pas encore voté",
  );
  assert.equal(
    summarizeParticipation(members, ["c", "l"], ME).pendingLabel,
    "Il ne manque plus que toi",
  );
  assert.equal(
    summarizeParticipation(members, [ME, "c", "l"], ME).pendingLabel,
    "Tout le monde a voté",
  );
});

test("summarizeParticipation : le vote d'un ancien membre n'est pas compté", () => {
  assert.equal(summarizeParticipation(members, [ME, "parti"], ME).votedCount, 1);
});

test("voteProgressLabel : singulier, pluriel, aucune proposition", () => {
  const two = { votedCount: 2, memberCount: 3, pendingLabel: "" };
  const one = { votedCount: 1, memberCount: 3, pendingLabel: "" };
  const zero = { votedCount: 0, memberCount: 2, pendingLabel: "" };
  assert.equal(voteProgressLabel(3, two), "3 propositions · 2 personnes sur 3 ont voté");
  assert.equal(voteProgressLabel(1, one), "1 proposition · 1 personne sur 3 a voté");
  assert.equal(voteProgressLabel(0, zero), "Aucune proposition · 0 personne sur 2 a voté");
});

test("groupSubtitle : sans vote, en cours, ce soir, cette semaine, plus ancien", () => {
  assert.equal(groupSubtitle(group("a", null), now), "3 membres");
  assert.equal(groupSubtitle(group("a", open("s", at(12))), now), "3 membres · vote en cours");
  assert.equal(groupSubtitle(group("a", closed("s", at(12))), now), "3 membres · ce soir : Pizza");
  assert.equal(groupSubtitle(group("a", closed("s", at(10))), now), "3 membres · mardi : Pizza");
  assert.equal(
    groupSubtitle(group("a", closed("s", at(1))), now),
    "3 membres · dernier vote : Pizza",
  );
  assert.equal(groupSubtitle({ ...group("a", null), members: [members[0]] }, now), "1 membre");
});

test("pickTonight : le vote ouvert le plus récent passe avant tout", () => {
  const tonight = pickTonight(
    [
      group("a", open("ancien", at(12, 12))),
      group("b", open("recent", at(12, 18), [ME])),
      group("c", closed("regle", at(12, 13))),
    ],
    ME,
    now,
  );
  assert.equal(tonight.kind, "open");
  assert.ok(tonight.kind === "open" && tonight.session.id === "recent" && tonight.hasMyVote);
});

test("pickTonight : je n'ai pas encore voté", () => {
  const tonight = pickTonight([group("a", open("s", at(12), ["c"]))], ME, now);
  assert.ok(tonight.kind === "open" && !tonight.hasMyVote);
});

test("pickTonight : un vote clôturé aujourd'hui, mais pas celui d'hier", () => {
  const today = pickTonight([group("a", closed("s", at(12, 13), "Curry"))], ME, now);
  assert.ok(today.kind === "decided" && today.session.winnerName === "Curry");

  const yesterday = pickTonight([group("a", closed("s", at(11)))], ME, now);
  assert.equal(yesterday.kind, "idle");
});

test("pickTonight : rien ce soir, lancement direct seulement avec un seul groupe", () => {
  const single = pickTonight([group("a", null)], ME, now);
  assert.ok(single.kind === "idle" && single.groupToStart?.id === "a");

  const several = pickTonight([group("a", null), group("b", null)], ME, now);
  assert.ok(several.kind === "idle" && several.groupToStart === null);

  const none = pickTonight([], ME, now);
  assert.ok(none.kind === "idle" && none.groupToStart === null);
});
