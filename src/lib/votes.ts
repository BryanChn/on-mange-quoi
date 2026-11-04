import { supabase } from "./supabase";

// Code Postgres d'une contrainte d'unicité violée.
const UNIQUE_VIOLATION = "23505";

export type Proposal = {
  id: string;
  name: string;
  voteCount: number;
  hasMyVote: boolean;
  isMine: boolean;
};

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  if (!userId) throw new Error("Aucun compte connecté.");
  return userId;
}

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

// Appelle onChange à chaque plat ou vote ajouté, retiré, modifié (la RLS ne laisse passer
// que ceux des groupes du membre). votes n'a pas de session_id, donc pas de filtre : un vote
// dans un autre groupe déclenche un rechargement inutile, acceptable à l'échelle d'un foyer.
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

export async function fetchProposals(sessionId: string): Promise<Proposal[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("proposals")
    .select("id, name, proposed_by, votes(profile_id)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map((proposal) => ({
    id: proposal.id,
    name: proposal.name,
    voteCount: proposal.votes.length,
    hasMyVote: proposal.votes.some((vote) => vote.profile_id === userId),
    isMine: proposal.proposed_by === userId,
  }));
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
