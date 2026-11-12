// Logique d'affichage de l'accueil et du vote, en fonctions pures : aucune requête, aucune
// horloge cachée (la date du jour est un paramètre). Testées dans tonight.test.ts.

export type Member = { id: string; name: string };

export type ProposalScore = { name: string; voteCount: number };

export type OpenHomeSession = {
  id: string;
  isOpen: true;
  createdAt: string;
  proposals: ProposalScore[];
  // Membres ayant coché au moins un plat.
  voterIds: string[];
};

export type ClosedHomeSession = { id: string; isOpen: false; closedAt: string; winnerName: string };

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

// Quand un vote a été clôturé : « ce soir », « mardi », puis la date au-delà de six jours
// (le nom du jour tromperait).
export function dayLabel(date: Date, now: Date): string {
  if (isSameDay(date, now)) return "ce soir";
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

const IDLE_LINES = [
  "Le frigo attend tes ordres.",
  "Quelqu’un a forcément une idée.",
  "Une envie ? Mets-la au vote.",
  "Deux minutes, et c’est réglé.",
];

// Petite phrase de la carte quand rien n'est prévu : elle change chaque jour, mais reste
// la même toute la journée (choisie par la date, pas au hasard).
export function idleLine(now: Date): string {
  return IDLE_LINES[now.getDate() % IDLE_LINES.length];
}

export function memberCountLabel(count: number): string {
  return `${count} membre${count > 1 ? "s" : ""}`;
}

// Sous le nom d'un groupe : « 3 membres · vote en cours », « 6 membres · mardi : Pizza ».
// Au-delà de six jours, le nom du jour tromperait (« mardi » d'il y a deux semaines).
export function groupSubtitle(group: HomeGroup, now: Date): string {
  const members = memberCountLabel(group.members.length);
  const session = group.latestSession;

  if (!session) return members;
  if (session.isOpen) return `${members} · vote en cours`;

  const closedAt = new Date(session.closedAt);
  if (isSameDay(closedAt, now)) return `${members} · ce soir : ${session.winnerName}`;
  if (now.getTime() - closedAt.getTime() < 6 * DAY_IN_MS) {
    return `${members} · ${weekdayName(closedAt)} : ${session.winnerName}`;
  }
  return `${members} · dernier vote : ${session.winnerName}`;
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
    } else if (isSameDay(new Date(session.closedAt), now)) {
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
