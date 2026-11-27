// Logique d'affichage de l'accueil et du vote, en fonctions pures : aucune requête, aucune
// horloge cachée (la date du jour est un paramètre). Testées dans tonight.test.ts.

import type { Member } from "./members";

export type { Member };

export type ProposalScore = { name: string; voteCount: number };

export type OpenHomeSession = {
  id: string;
  isOpen: true;
  createdAt: string;
  proposals: ProposalScore[];
  // Membres ayant coché au moins un plat.
  voterIds: string[];
};

export type ClosedHomeSession = {
  id: string;
  isOpen: false;
  closedAt: string;
  winnerName: string;
  // Midi ou soir : « Ce midi, c'est Pizza ! », et midi n'est plus « décidé » après 15 h.
  moment: MealMoment;
};

export type HomeGroup = {
  id: string;
  name: string;
  members: Member[];
  // L'ouverte s'il y en a une (une seule possible par groupe), sinon la dernière clôturée.
  latestSession: OpenHomeSession | ClosedHomeSession | null;
};

// Ce que montre la carte « Ce soir » :
// - open : un vote est en cours (le plus récent s'il y en a plusieurs) ;
// - decided : rien d'ouvert, mais un vote a été clôturé aujourd'hui ;
// - idle : rien ce soir. groupToStart est le groupe où lancer un vote en un appui,
//   null si l'utilisateur a plusieurs groupes (il choisit dans la liste) ou aucun.
export type Tonight =
  | { kind: "open"; group: HomeGroup; session: OpenHomeSession; hasMyVote: boolean }
  | { kind: "decided"; group: HomeGroup; session: ClosedHomeSession }
  | { kind: "idle"; groupToStart: HomeGroup | null };

export type Participation = { votedCount: number; memberCount: number; pendingLabel: string };

// ─── Midi ou soir (migration vote_moment) ───────────────

export type MealMoment = "midi" | "soir";

// Avant 15 h, on pense au repas de midi ; après, à celui du soir. Même heure que le serveur
// (set_vote_session_moment) pour un lancement sans moment.
export const MOMENT_SWITCH_HOUR = 15;

// Le moment présélectionné au lancement, et celui de la question de l'accueil.
export function defaultMoment(now: Date): MealMoment {
  return now.getHours() < MOMENT_SWITCH_HOUR ? "midi" : "soir";
}

// « ce midi », « ce soir ».
export function momentLabel(moment: MealMoment): string {
  return moment === "midi" ? "ce midi" : "ce soir";
}

// Un vote décidé aujourd'hui pour midi n'est plus « le repas qui vient » après 15 h : l'accueil
// repasse à « on mange quoi ce soir ? ».
export function isMomentPast(moment: MealMoment, now: Date): boolean {
  return moment === "midi" && now.getHours() >= MOMENT_SWITCH_HOUR;
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

// Même jour du calendrier, dans le fuseau du téléphone.
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

// « 18:42 », « 07:05 ».
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Quand un vote a été clôturé : « ce midi » ou « ce soir » (« aujourd'hui » pour un repas à
// plusieurs, sans moment), « mardi », puis la date au-delà de six jours (le nom du jour
// tromperait).
export function dayLabel(date: Date, now: Date, moment: MealMoment | null): string {
  if (isSameDay(date, now)) return moment ? momentLabel(moment) : "aujourd’hui";
  if (now.getTime() - date.getTime() < 6 * DAY_IN_MS) return weekdayName(date);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `le ${day}/${month}`;
}

// Titre du vote en cours. Même règle que close_session : plusieurs plats au maximum
// de votes = égalité.
export function leadingTitle(proposals: ProposalScore[]): string {
  if (proposals.length === 0) return "À toi de proposer";

  const maxVotes = Math.max(...proposals.map((proposal) => proposal.voteCount));
  if (maxVotes === 0) return "À vos votes !";

  const leading = proposals.filter((proposal) => proposal.voteCount === maxVotes);
  if (leading.length === 1) return `${leading[0].name} en tête`;
  if (leading.length === 2) return `${leading[0].name} et ${leading[1].name} à égalité`;
  return `${leading.length} plats à égalité`;
}

// Qui a voté, et qui on attend. Un ancien membre qui avait voté n'est pas compté :
// le total se lit « sur les membres actuels ».
export function summarizeParticipation(
  members: Member[],
  voterIds: string[],
  userId: string,
): Participation {
  const voters = new Set(voterIds);
  const pending = members.filter((member) => !voters.has(member.id));
  const pendingOthers = pending.filter((member) => member.id !== userId);

  let pendingLabel: string;
  if (pending.length === 0) {
    pendingLabel = "Tout le monde a voté";
  } else if (pendingOthers.length === 0) {
    pendingLabel = "Il ne manque plus que toi";
  } else if (pendingOthers.length === 1) {
    pendingLabel = `${pendingOthers[0].name} n’a pas encore voté`;
  } else {
    const otherCount = pendingOthers.length - 1;
    pendingLabel = `${pendingOthers[0].name} et ${otherCount} autre${
      otherCount > 1 ? "s" : ""
    } n’ont pas encore voté`;
  }

  return {
    votedCount: members.length - pending.length,
    memberCount: members.length,
    pendingLabel,
  };
}

// « 3 plats proposés · 2 personnes sur 3 ont voté ». Sans plat, personne ne peut voter ;
// seul dans le groupe, le décompte des votants n'apprend rien : on ne l'affiche pas.
export function voteProgressLabel(proposalCount: number, participation: Participation): string {
  if (proposalCount === 0) return "Aucun plat pour l’instant. Lance les idées !";

  const proposals = `${proposalCount} plat${proposalCount > 1 ? "s proposés" : " proposé"}`;
  const { votedCount, memberCount } = participation;
  if (memberCount <= 1) return proposals;

  let voters: string;
  if (votedCount === 0) voters = "personne n’a encore voté";
  else if (votedCount === 1) voters = `1 personne sur ${memberCount} a voté`;
  else voters = `${votedCount} personnes sur ${memberCount} ont voté`;
  return `${proposals} · ${voters}`;
}

export function everyoneHasVoted({ votedCount, memberCount }: Participation): boolean {
  return memberCount > 0 && votedCount === memberCount;
}

// Sous la liste du vote : « 2 sur 3 ont voté · Léa n’a pas encore voté ». Quand tout le
// monde a voté, il n'y a plus rien à attendre : on dit qui peut terminer le vote. Sans organisateur
// (il a quitté le groupe), c'est l'owner qui clôture : on ne le nomme pas, l'écran ne le
// connaît pas.
export function participationLine(
  participation: Participation,
  closer: { canClose: boolean; organizerName: string | null },
): string {
  const { votedCount, memberCount, pendingLabel } = participation;

  if (everyoneHasVoted(participation)) {
    if (closer.canClose) return "Tout le monde a voté : à toi de terminer le vote !";
    if (closer.organizerName)
      return `Tout le monde a voté : ${closer.organizerName} peut terminer le vote`;
    return pendingLabel;
  }
  return `${votedCount} sur ${memberCount} ${votedCount > 1 ? "ont" : "a"} voté · ${pendingLabel}`;
}

const IDLE_LINES = [
  "Le frigo attend tes ordres.",
  "Quelqu’un a forcément une idée.",
  "Une envie ? Mets-la au vote.",
  "Deux minutes, et c’est décidé.",
];

// Petite phrase de la carte quand rien n'est prévu : elle change chaque jour, mais reste
// la même toute la journée (choisie par la date, pas au hasard).
export function idleLine(now: Date): string {
  return IDLE_LINES[now.getDate() % IDLE_LINES.length];
}

export function memberCountLabel(count: number): string {
  return `${count} membre${count > 1 ? "s" : ""}`;
}

export function pickTonight(groups: HomeGroup[], userId: string, now: Date): Tonight {
  let latestOpen: { group: HomeGroup; session: OpenHomeSession } | null = null;
  let latestDecided: { group: HomeGroup; session: ClosedHomeSession } | null = null;

  for (const group of groups) {
    const session = group.latestSession;
    if (!session) continue;

    if (session.isOpen) {
      if (!latestOpen || session.createdAt > latestOpen.session.createdAt) {
        latestOpen = { group, session };
      }
    } else if (isSameDay(new Date(session.closedAt), now) && !isMomentPast(session.moment, now)) {
      // Décidé aujourd'hui pour un repas qui n'est pas encore passé : midi s'efface à 15 h.
      if (!latestDecided || session.closedAt > latestDecided.session.closedAt) {
        latestDecided = { group, session };
      }
    }
  }

  if (latestOpen) {
    return { kind: "open", ...latestOpen, hasMyVote: latestOpen.session.voterIds.includes(userId) };
  }
  if (latestDecided) {
    return { kind: "decided", ...latestDecided };
  }
  return { kind: "idle", groupToStart: groups.length === 1 ? groups[0] : null };
}

// ─── Accueil par groupe (refonte v4 du 2026-11-27) ───────────────

// Le point de la pastille d'un groupe : un vote en cours (tomate), décidé pour le prochain
// repas (basilic), ou rien.
export type GroupStatus = "open" | "decided" | "none";

export function groupStatus(group: HomeGroup, now: Date): GroupStatus {
  const session = group.latestSession;
  if (!session) return "none";
  if (session.isOpen) return "open";
  const decidedToday = isSameDay(new Date(session.closedAt), now);
  return decidedToday && !isMomentPast(session.moment, now) ? "decided" : "none";
}

// La carte « Ce soir » d'un seul groupe : mêmes règles que pour tous, et le vote se lance
// toujours dans ce groupe-là.
export function groupTonight(group: HomeGroup, userId: string, now: Date): Tonight {
  return pickTonight([group], userId, now);
}

// Le groupe affiché à l'ouverture : celui où il se passe quelque chose (vote en cours le plus
// récent, sinon décidé aujourd'hui), sinon le premier.
export function featuredGroupIndex(groups: HomeGroup[], userId: string, now: Date): number {
  const tonight = pickTonight(groups, userId, now);
  if (tonight.kind === "idle") return 0;
  return Math.max(
    0,
    groups.findIndex((group) => group.id === tonight.group.id),
  );
}

export function toBuyLabel(count: number): string {
  return count === 0 ? "Rien à acheter" : `${count} à acheter`;
}

// « Bryan, Léa, Tom » ; au-delà de trois : « Bryan, Léa, Tom et 2 autres ».
export function memberNamesLine(members: Pick<Member, "name">[], max = 3): string {
  const names = members.slice(0, max).map((member) => member.name);
  const rest = members.length - names.length;
  if (rest <= 0) return names.join(", ");
  return `${names.join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
}
