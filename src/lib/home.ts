import { getUserId } from "./account";
import { supabase } from "./supabase";
import type { HomeGroup } from "./tonight";

export type Home = { userId: string; groups: HomeGroup[] };

// Tout l'accueil en une requête : les groupes du membre (la RLS filtre), leurs membres,
// et pour chacun sa session la plus récente avec ses plats et ses votes. Une requête par
// groupe (problème « N+1 ») ralentirait l'écran à chaque groupe ajouté.
export async function fetchHome(): Promise<Home> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("groups")
    .select(
      `id, name,
      group_members(profile_id, joined_at, profiles(display_name)),
      vote_sessions(id, status, created_at, closed_at,
        winner:proposals!vote_sessions_winner_fk(name),
        proposals!proposals_session_id_fkey(name, votes(profile_id)))`,
    )
    .order("created_at", { ascending: true })
    .order("joined_at", { referencedTable: "group_members", ascending: true })
    // La plus récente seulement : c'est l'ouverte s'il y en a une (une seule par groupe).
    .order("created_at", { referencedTable: "vote_sessions", ascending: false })
    .limit(1, { referencedTable: "vote_sessions" });

  if (error) throw error;

  const groups = data.map((group): HomeGroup => {
    const members = group.group_members.map((member) => ({
      id: member.profile_id,
      name: member.profiles?.display_name ?? "Un membre",
    }));
    const session = group.vote_sessions.at(0);

    if (!session) return { id: group.id, name: group.name, members, latestSession: null };

    if (session.status === "open") {
      const voterIds = new Set(
        session.proposals.flatMap((proposal) => proposal.votes.map((vote) => vote.profile_id)),
      );
      return {
        id: group.id,
        name: group.name,
        members,
        latestSession: {
          id: session.id,
          isOpen: true,
          createdAt: session.created_at,
          proposals: session.proposals.map((proposal) => ({
            name: proposal.name,
            voteCount: proposal.votes.length,
          })),
          voterIds: [...voterIds],
        },
      };
    }

    return {
      id: group.id,
      name: group.name,
      members,
      latestSession: {
        id: session.id,
        isOpen: false,
        // Une session clôturée a toujours une date et un gagnant (contraintes de vote_sessions).
        closedAt: session.closed_at ?? session.created_at,
        winnerName: session.winner?.name ?? "",
      },
    };
  });

  return { userId, groups };
}

// Appelle onChange dès qu'un vote, un plat ou une session change dans un groupe du membre
// (la RLS ne laisse passer que ceux-là). Pas de filtre : un DELETE ne transporte que l'id
// de la ligne, un filtre l'écarterait (limite de Supabase Realtime).
// Renvoie la fonction de désabonnement.
export function subscribeToHome(onChange: () => void): () => void {
  const channel = supabase
    .channel("home")
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "proposals" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "vote_sessions" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
