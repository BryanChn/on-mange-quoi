import { supabase } from "./supabase";

export type Member = { profileId: string; displayName: string; joinedAt: string };

// Conséquence de la suppression pour un groupe dont l'utilisateur est owner.
// successorName null : il y est seul, le groupe sera supprimé.
export type OwnedGroupImpact = { groupId: string; groupName: string; successorName: string | null };

export type DeletionImpact = {
  ownedGroups: OwnedGroupImpact[];
  // Votes en cours qu'il organise : ils restent ouverts, l'owner du groupe pourra les clôturer.
  openSessionCount: number;
};

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  if (!userId) throw new Error("Aucun compte connecté.");
  return userId;
}

// Même règle que leave_group : le membre le plus ancien (joined_at), puis profile_id pour
// départager. Les uuid en minuscules se comparent comme Postgres les trie.
export function pickSuccessor(members: Member[], leavingId: string): Member | null {
  const others = members.filter((member) => member.profileId !== leavingId);
  others.sort(
    (a, b) =>
      a.joinedAt.localeCompare(b.joinedAt) ||
      (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0),
  );
  return others[0] ?? null;
}

// Ce qui va se passer, pour prévenir avant de supprimer (règle de docs/schema.md).
// Indicatif : delete_account refait le calcul côté serveur, dans une transaction.
export async function fetchDeletionImpact(): Promise<DeletionImpact> {
  const userId = await getUserId();

  const [groupsResult, sessionsResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, group_members(profile_id, joined_at, profiles(display_name))")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("vote_sessions")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", userId)
      .eq("status", "open"),
  ]);

  if (groupsResult.error) throw groupsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;

  const ownedGroups = groupsResult.data.map((group) => {
    const members = group.group_members.map((member) => ({
      profileId: member.profile_id,
      displayName: member.profiles?.display_name ?? "Un membre",
      joinedAt: member.joined_at,
    }));
    return {
      groupId: group.id,
      groupName: group.name,
      successorName: pickSuccessor(members, userId)?.displayName ?? null,
    };
  });

  return { ownedGroups, openSessionCount: sessionsResult.count ?? 0 };
}

// Supprime le compte (groupes transmis ou supprimés, plats sans vote retirés), puis
// déconnecte. scope local : le compte n'existe plus, inutile de prévenir le serveur ;
// on efface seulement la session enregistrée sur le téléphone.
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_account");
  if (error) throw error;

  await supabase.auth.signOut({ scope: "local" });
}
