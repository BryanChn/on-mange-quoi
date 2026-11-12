import type { Enums } from "./database.types";
import { MEMBER_COLUMNS, toMembers, type Member } from "./members";
import { getUserId, supabase } from "./supabase";
import { summarizeParticipation, type Participation } from "./tonight";

// Code Postgres d'une contrainte d'unicité violée.
const UNIQUE_VIOLATION = "23505";
// Codes et hints levés par les fonctions SQL du vote (voir les migrations).
const ALREADY_CLOSED = "55000";
const INVALID_CHOICE = "22023";
const TIE_NEEDS_CHOICE = "tie_needs_choice";
const SESSION_CLOSED = "session_closed";

export type DecisionMethod = Enums<"decision_method">;

export type Proposal = {
  id: string;
  name: string;
  voteCount: number;
  hasMyVote: boolean;
  isMine: boolean;
  // Qui a coché ce plat, « toi » en premier.
  voterNames: string[];
};

export type VoteSession = {
  groupId: string;
  // Rappelé dans l'en-tête : un membre de plusieurs groupes sait pour lequel il vote.
  groupName: string;
  members: Member[];
  // null : l'organisateur a quitté le groupe ou supprimé son compte.
  organizerName: string | null;
  createdAt: string;
  closedAt: string | null;
  // Qui a voté parmi les membres actuels, et qui on attend.
  participation: Participation;
  isOpen: boolean;
  // Organisateur ou owner du groupe : l'écran guide, close_session protège.
  canClose: boolean;
  winnerProposalId: string | null;
  decidedBy: DecisionMethod | null;
  proposals: Proposal[];
};

// Dernière session du groupe : l'ouverte s'il y en a une (une seule possible, et c'est
// forcément la plus récente), sinon la dernière clôturée et son gagnant.
export type LatestSession =
  { id: string; isOpen: true } | { id: string; isOpen: false; winnerName: string };

// tie : égalité, il faut choisir le tirage ou un plat. not_tied : les votes ont bougé
// pendant le choix, le plat choisi n'est plus ex æquo.
export type CloseOutcome = "closed" | "tie" | "not_tied";

export type TieBreak = { method: "tirage" } | { method: "organisateur"; proposalId: string };

export async function fetchOpenSessionId(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("vote_sessions")
    .select("id")
    .eq("group_id", groupId)
    .eq("status", "open")
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export async function fetchLatestSession(groupId: string): Promise<LatestSession | null> {
  const { data, error } = await supabase
    .from("vote_sessions")
    .select("id, status, winner:proposals!vote_sessions_winner_fk(name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.status === "open") return { id: data.id, isOpen: true };
  // Une session clôturée a toujours un gagnant (contrainte de vote_sessions).
  return { id: data.id, isOpen: false, winnerName: data.winner?.name ?? "" };
}

// Appelle onChange à chaque plat ou vote ajouté, retiré, modifié, et à la clôture (la RLS
// ne laisse passer que ceux des groupes du membre). votes n'a pas de session_id, donc pas
// de filtre : un vote dans un autre groupe déclenche un rechargement inutile, acceptable
// à l'échelle d'un foyer.
// Renvoie la fonction de désabonnement, à appeler en quittant l'écran.
export function subscribeToSession(sessionId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`session:${sessionId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "proposals", filter: `session_id=eq.${sessionId}` },
      onChange,
    )
    // Un DELETE ne transporte que l'id de la ligne : le filtre sur session_id l'écarterait
    // (limite de Supabase Realtime). On écoute donc les retraits de plats sans filtre.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "proposals" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, onChange)
    // Clôture : status, gagnant et decided_by changent, pour tout le groupe en même temps.
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "vote_sessions", filter: `id=eq.${sessionId}` },
      onChange,
    )
    // (Re)connexion confirmée : rattrape les changements manqués pendant une coupure.
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onChange();
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

// Si un autre membre vient de lancer un vote, l'index unique refuse le second :
// on rejoint alors sa session au lieu d'afficher une erreur.
export async function startSession(groupId: string): Promise<string> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("vote_sessions")
    .insert({ group_id: groupId, organizer_id: userId })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    const openSessionId = await fetchOpenSessionId(groupId);
    if (openSessionId) return openSessionId;
  }
  if (error) throw error;
  return data.id;
}

// Une seule requête : la session, ses plats et leurs votes (jointures PostgREST).
// single : une session absente ou d'un autre groupe (masquée par la RLS) lève une erreur.
export async function fetchSession(sessionId: string): Promise<VoteSession> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("vote_sessions")
    .select(
      `group_id, status, organizer_id, winner_proposal_id, decided_by, created_at, closed_at,
      groups(owner_id, name, ${MEMBER_COLUMNS}),
      proposals!proposals_session_id_fkey(id, name, proposed_by, votes(profile_id))`,
    )
    .eq("id", sessionId)
    .order("created_at", { referencedTable: "proposals", ascending: true })
    .single();

  if (error) throw error;

  const members = toMembers(data.groups?.group_members ?? []);
  const nameById = new Map(members.map((member) => [member.id, member.name]));
  const voterIds = new Set(
    data.proposals.flatMap((proposal) => proposal.votes.map((vote) => vote.profile_id)),
  );

  return {
    groupId: data.group_id,
    // Toujours présent : la RLS ne montre une session qu'aux membres de son groupe.
    groupName: data.groups?.name ?? "",
    members,
    organizerName: data.organizer_id ? (nameById.get(data.organizer_id) ?? null) : null,
    createdAt: data.created_at,
    closedAt: data.closed_at,
    participation: summarizeParticipation(members, [...voterIds], userId),
    isOpen: data.status === "open",
    canClose: data.organizer_id === userId || data.groups?.owner_id === userId,
    winnerProposalId: data.winner_proposal_id,
    decidedBy: data.decided_by,
    proposals: data.proposals.map((proposal) => ({
      id: proposal.id,
      name: proposal.name,
      voteCount: proposal.votes.length,
      hasMyVote: proposal.votes.some((vote) => vote.profile_id === userId),
      isMine: proposal.proposed_by === userId,
      voterNames: proposal.votes
        .map((vote) =>
          vote.profile_id === userId
            ? "toi"
            : (nameById.get(vote.profile_id) ?? "un ancien membre"),
        )
        // « toi » d'abord, puis l'ordre alphabétique : stable d'un rechargement à l'autre.
        .sort((a, b) => Number(b === "toi") - Number(a === "toi") || a.localeCompare(b)),
    })),
  };
}

// Le gagnant est calculé (et le tirage fait) par close_session, jamais sur le téléphone.
// Sans tieBreak, un gagnant unique clôture la session ; une égalité renvoie "tie".
export async function closeSession(sessionId: string, tieBreak?: TieBreak): Promise<CloseOutcome> {
  const { error } = await supabase.rpc("close_session", {
    target_session_id: sessionId,
    method: tieBreak?.method,
    chosen_proposal_id: tieBreak?.method === "organisateur" ? tieBreak.proposalId : undefined,
  });

  if (error?.hint === TIE_NEEDS_CHOICE) return "tie";
  if (error?.code === INVALID_CHOICE && tieBreak?.method === "organisateur") return "not_tied";
  // Déjà clôturée (par l'owner, ou un double appui) : le résultat voulu est atteint.
  if (error?.code === ALREADY_CLOSED) return "closed";
  if (error) throw error;
  return "closed";
}

// Écriture refusée parce que la session vient d'être clôturée (verrou de la migration
// close_session_realtime_and_lock) : à distinguer d'une erreur réseau.
export function isSessionClosedError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "hint" in error && error.hint === SESSION_CLOSED
  );
}

// false = ce plat est déjà proposé dans la session (« Pizza » et « pizza » comptent pareil).
export async function addProposal(sessionId: string, name: string): Promise<boolean> {
  const userId = await getUserId();
  const { error } = await supabase
    .from("proposals")
    .insert({ session_id: sessionId, name, proposed_by: userId });

  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw error;
  return true;
}

// La RLS refuse le retrait s'il y a déjà des votes, mais sans erreur : 0 ligne supprimée.
// count permet de le détecter (un membre a pu voter juste avant).
export async function removeProposal(proposalId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("proposals")
    .delete({ count: "exact" })
    .eq("id", proposalId);

  if (error) throw error;
  return count === 1;
}

export async function setVote(proposalId: string, wantVote: boolean): Promise<void> {
  const userId = await getUserId();

  if (wantVote) {
    const { error } = await supabase
      .from("votes")
      .insert({ proposal_id: proposalId, profile_id: userId });

    // Déjà coché (depuis un autre téléphone) : le résultat voulu est atteint.
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
    return;
  }

  const { error } = await supabase
    .from("votes")
    .delete()
    .eq("proposal_id", proposalId)
    .eq("profile_id", userId);

  if (error) throw error;
}

// Plats en tête, même règle que close_session : plusieurs = égalité, aucun vote = tous
// ex æquo. Sert à l'affichage (choix manuel, roulette) ; le serveur revérifie toujours.
export function getLeadingProposals(proposals: Proposal[]): Proposal[] {
  const maxVotes = Math.max(...proposals.map((proposal) => proposal.voteCount));
  return proposals.filter((proposal) => proposal.voteCount === maxVotes);
}
