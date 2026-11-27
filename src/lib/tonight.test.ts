import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AVATAR_BACKGROUNDS,
  AVATAR_IDS,
  getInitial,
  pickAvatarColor,
  toAvatarId,
} from "./avatar.ts";
import { pickSuccessor, toMembers, type Member } from "./members.ts";
import {
  dayLabel,
  defaultMoment,
  everyoneHasVoted,
  formatTime,
  featuredGroupIndex,
  groupStatus,
  groupTonight,
  memberNamesLine,
  toBuyLabel,
  idleLine,
  isMomentPast,
  leadingTitle,
  momentLabel,
  participationLine,
  pickTonight,
  summarizeParticipation,
  voteProgressLabel,
  type ClosedHomeSession,
  type HomeGroup,
  type OpenHomeSession,
} from "./tonight.ts";

const ME = "me";
const members: Member[] = [
  { id: ME, name: "Bryan", joinedAt: "2026-10-01T10:00:00Z", avatar: null, photoPath: null },
  { id: "c", name: "Camille", joinedAt: "2026-10-02T10:00:00Z", avatar: "chat", photoPath: null },
  { id: "l", name: "Léa", joinedAt: "2026-10-03T10:00:00Z", avatar: null, photoPath: null },
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
function closed(
  id: string,
  closedAt: string,
  winnerName = "Pizza",
  moment: "midi" | "soir" = "soir",
): ClosedHomeSession {
  return { id, isOpen: false, closedAt, winnerName, moment };
}

test("getInitial : première lettre en majuscule, espaces ignorés, nom vide", () => {
  assert.equal(getInitial("bryan"), "B");
  assert.equal(getInitial("  léa"), "L");
  assert.equal(getInitial(""), "?");
  assert.equal(getInitial("   "), "?");
  // Un emoji tient sur deux unités de code : charAt(0) n'en lirait que la moitié.
  assert.equal(getInitial("🍕 Léa"), "🍕");
});

test("toMembers : nom de secours, avatar transmis, du plus ancien au plus récent", () => {
  const rows = [
    {
      profile_id: "b",
      joined_at: "2026-10-02T10:00:00Z",
      profiles: { display_name: "Léa", avatar: "pizza", photo_path: "b/photo.jpg" },
    },
    { profile_id: "a", joined_at: "2026-10-01T10:00:00Z", profiles: null },
  ];
  assert.deepEqual(toMembers(rows), [
    { id: "a", name: "Un membre", joinedAt: "2026-10-01T10:00:00Z", avatar: null, photoPath: null },
    {
      id: "b",
      name: "Léa",
      joinedAt: "2026-10-02T10:00:00Z",
      avatar: "pizza",
      photoPath: "b/photo.jpg",
    },
  ]);
});

test("pickSuccessor : le plus ancien des autres, l'identifiant départage, personne si seul", () => {
  assert.equal(pickSuccessor(members, ME)?.name, "Camille");
  const sameDay = [
    { id: "z", name: "Zoé", joinedAt: "2026-10-05T10:00:00Z", avatar: null, photoPath: null },
    { id: "y", name: "Yann", joinedAt: "2026-10-05T10:00:00Z", avatar: null, photoPath: null },
  ];
  assert.equal(pickSuccessor([...sameDay, members[0]], ME)?.name, "Yann");
  assert.equal(pickSuccessor([members[0]], ME), null);
});

test("toAvatarId : les six avatars, sinon l'initiale (null)", () => {
  for (const id of AVATAR_IDS) assert.equal(toAvatarId(id), id);
  assert.equal(toAvatarId(null), null);
  assert.equal(toAvatarId(undefined), null);
  assert.equal(toAvatarId(""), null);
  // Valeur ajoutée par une version plus récente de l'app : l'initiale, pas de plantage.
  assert.equal(toAvatarId("licorne"), null);
});

test("AVATAR_BACKGROUNDS : un fond pour chaque avatar", () => {
  assert.deepEqual(Object.keys(AVATAR_BACKGROUNDS).sort(), [...AVATAR_IDS].sort());
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

test("dayLabel : ce midi ou ce soir, jour de la semaine, puis date", () => {
  assert.equal(dayLabel(new Date(at(12, 13)), now, "soir"), "ce soir");
  assert.equal(dayLabel(new Date(at(12, 11)), now, "midi"), "ce midi");
  assert.equal(dayLabel(new Date(at(12, 13)), now, null), "aujourd’hui");
  assert.equal(dayLabel(new Date(at(10)), now, "soir"), "mardi");
  assert.equal(dayLabel(new Date(at(1)), now, "soir"), "le 01/11");
});

test("leadingTitle : aucun plat, aucun vote, un plat en tête, égalités", () => {
  assert.equal(leadingTitle([]), "À toi de proposer");
  assert.equal(leadingTitle([{ name: "Pizza", voteCount: 0 }]), "À vos votes !");
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

test("voteProgressLabel : sans plat, seul, personne, singulier, pluriel", () => {
  const of = (votedCount: number, memberCount: number) => ({
    votedCount,
    memberCount,
    pendingLabel: "",
  });
  assert.equal(voteProgressLabel(0, of(0, 3)), "Aucun plat pour l’instant. Lance les idées !");
  assert.equal(voteProgressLabel(1, of(0, 1)), "1 plat proposé");
  assert.equal(voteProgressLabel(2, of(0, 3)), "2 plats proposés · personne n’a encore voté");
  assert.equal(voteProgressLabel(1, of(1, 3)), "1 plat proposé · 1 personne sur 3 a voté");
  assert.equal(voteProgressLabel(3, of(2, 3)), "3 plats proposés · 2 personnes sur 3 ont voté");
});

test("participationLine : on attend encore quelqu'un", () => {
  const closer = { canClose: true, organizerName: "Bryan" };
  assert.equal(
    participationLine(summarizeParticipation(members, [ME], ME), closer),
    "1 sur 3 a voté · Camille et 1 autre n’ont pas encore voté",
  );
  assert.equal(
    participationLine(summarizeParticipation(members, [ME, "c"], ME), closer),
    "2 sur 3 ont voté · Léa n’a pas encore voté",
  );
});

test("participationLine : tout le monde a voté, on dit qui clôture", () => {
  const all = summarizeParticipation(members, [ME, "c", "l"], ME);
  assert.equal(
    participationLine(all, { canClose: true, organizerName: "Bryan" }),
    "Tout le monde a voté : à toi de terminer le vote !",
  );
  assert.equal(
    participationLine(all, { canClose: false, organizerName: "Camille" }),
    "Tout le monde a voté : Camille peut terminer le vote",
  );
  // Organisateur parti : l'owner clôture, l'écran ne connaît pas son nom.
  assert.equal(
    participationLine(all, { canClose: false, organizerName: null }),
    "Tout le monde a voté",
  );
});

test("everyoneHasVoted : groupe vide, partiel, complet", () => {
  const of = (votedCount: number, memberCount: number) => ({
    votedCount,
    memberCount,
    pendingLabel: "",
  });
  assert.equal(everyoneHasVoted(of(0, 0)), false);
  assert.equal(everyoneHasVoted(of(2, 3)), false);
  assert.equal(everyoneHasVoted(of(3, 3)), true);
});

test("idleLine : la même phrase toute la journée", () => {
  assert.equal(idleLine(new Date(2026, 10, 12, 8)), idleLine(new Date(2026, 10, 12, 22)));
  assert.ok(idleLine(new Date(2026, 10, 13)).length > 0);
});

test("groupStatus : le point de la pastille d'un groupe", () => {
  assert.equal(groupStatus(group("a", null), now), "none");
  assert.equal(groupStatus(group("a", open("s", at(12))), now), "open");
  assert.equal(groupStatus(group("a", closed("s", at(12))), now), "decided");
  // Décidé hier, ou pour un midi déjà passé : plus rien à signaler.
  assert.equal(groupStatus(group("a", closed("s", at(11))), now), "none");
  assert.equal(groupStatus(group("a", closed("s", at(12, 11), "Salade", "midi")), now), "none");
});

test("groupTonight : chaque groupe a sa carte, et le vote s'y lance en un appui", () => {
  const idle = groupTonight(group("b", null), ME, now);
  assert.ok(idle.kind === "idle" && idle.groupToStart?.id === "b");
  const decided = groupTonight(group("b", closed("s", at(12), "Curry")), ME, now);
  assert.ok(decided.kind === "decided" && decided.session.winnerName === "Curry");
});

test("featuredGroupIndex : on ouvre sur le groupe où il se passe quelque chose", () => {
  assert.equal(featuredGroupIndex([group("a", null), group("b", null)], ME, now), 0);
  assert.equal(featuredGroupIndex([group("a", null), group("b", closed("s", at(12)))], ME, now), 1);
  assert.equal(
    featuredGroupIndex(
      [group("a", closed("s", at(12))), group("b", null), group("c", open("v", at(12)))],
      ME,
      now,
    ),
    2,
  );
  assert.equal(featuredGroupIndex([], ME, now), 0);
});

test("toBuyLabel et memberNamesLine : les sous-titres des outils du groupe", () => {
  assert.equal(toBuyLabel(0), "Rien à acheter");
  assert.equal(toBuyLabel(5), "5 à acheter");
  assert.equal(memberNamesLine(members), "Bryan, Camille, Léa");
  const five = [...members, { name: "Tom" }, { name: "Zoé" }];
  assert.equal(memberNamesLine(five), "Bryan, Camille, Léa et 2 autres");
  assert.equal(memberNamesLine(five.slice(0, 4)), "Bryan, Camille, Léa et 1 autre");
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

test("pickTonight : décidé pour midi, c'est réglé jusqu'à 15 h, puis on pense au soir", () => {
  const lunch = [group("a", closed("s", at(12, 11), "Salade", "midi"))];
  const atNoon = new Date(2026, 10, 12, 12, 30);
  const noonCard = pickTonight(lunch, ME, atNoon);
  assert.ok(noonCard.kind === "decided" && noonCard.session.winnerName === "Salade");

  // À 19 h (now), le midi est passé : l'accueil propose de lancer le vote du soir.
  const eveningCard = pickTonight(lunch, ME, now);
  assert.ok(eveningCard.kind === "idle" && eveningCard.groupToStart?.id === "a");
});

test("pickTonight : rien ce soir, lancement direct seulement avec un seul groupe", () => {
  const single = pickTonight([group("a", null)], ME, now);
  assert.ok(single.kind === "idle" && single.groupToStart?.id === "a");

  const several = pickTonight([group("a", null), group("b", null)], ME, now);
  assert.ok(several.kind === "idle" && several.groupToStart === null);

  const none = pickTonight([], ME, now);
  assert.ok(none.kind === "idle" && none.groupToStart === null);
});

// ─── Midi ou soir ───
const clock = (hours: number, minutes = 0) => new Date(2026, 10, 25, hours, minutes);

test("defaultMoment : midi jusqu'à 14 h 59, soir dès 15 h", () => {
  assert.equal(defaultMoment(clock(8)), "midi");
  assert.equal(defaultMoment(clock(14, 59)), "midi");
  assert.equal(defaultMoment(clock(15)), "soir");
  assert.equal(defaultMoment(clock(23)), "soir");
});

test("momentLabel : « ce midi », « ce soir »", () => {
  assert.equal(momentLabel("midi"), "ce midi");
  assert.equal(momentLabel("soir"), "ce soir");
});

test("isMomentPast : midi passé à 15 h, le soir jamais dans la journée", () => {
  assert.equal(isMomentPast("midi", clock(14, 59)), false);
  assert.equal(isMomentPast("midi", clock(15)), true);
  assert.equal(isMomentPast("soir", clock(23, 59)), false);
});
