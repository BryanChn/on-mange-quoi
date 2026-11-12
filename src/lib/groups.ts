import type { Tables } from "./database.types";
import { MEMBER_COLUMNS, pickSuccessor, toMembers, type Member } from "./members";
import { getUserId, supabase } from "./supabase";

export type Group = Pick<Tables<"groups">, "id" | "name">;
export type GroupDetail = Pick<Tables<"groups">, "id" | "name" | "invite_code" | "owner_id"> & {
  // Du plus ancien au plus récent.
  members: Member[];
};

// Ce qui se passe si l'utilisateur quitte le groupe (règle de leave_group) :
// - member : simple membre, le groupe continue sans lui ;
// - transfer : owner, le groupe passe à successorName ;
// - delete : owner et seul membre, le groupe est supprimé avec son historique.
export type LeaveImpact =
  { kind: "member" } | { kind: "transfer"; successorName: string } | { kind: "delete" };

// Code renvoyé par join_group quand aucun groupe ne correspond.
const INVALID_INVITE_CODE = "P0002";

// Pas de filtre sur l'utilisateur : la RLS ne renvoie déjà que ses groupes.
export async function fetchGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// single : un groupe absent ou d'un autre foyer (masqué par la RLS) lève une erreur.
export async function fetchGroup(groupId: string): Promise<GroupDetail> {
  const { data, error } = await supabase
    .from("groups")
    .select(`id, name, invite_code, owner_id, ${MEMBER_COLUMNS}`)
    .eq("id", groupId)
    .single();

  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    invite_code: data.invite_code,
    owner_id: data.owner_id,
    members: toMembers(data.group_members),
  };
}

// Passe par la fonction SQL : le code est généré côté serveur et l'owner inscrit
// comme membre dans la même transaction.
export async function createGroup(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_group", { group_name: name });

  if (error) throw error;
  return data.id;
}

// null = code invalide, à ne pas confondre avec un échec réseau, qui lève une erreur.
export async function joinGroup(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("join_group", { code });

  if (error?.code === INVALID_INVITE_CODE) return null;
  if (error) throw error;
  return data;
}

// Indicatif, pour prévenir avant de quitter : leave_group refait le calcul côté serveur.
export async function fetchLeaveImpact(groupId: string): Promise<LeaveImpact> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("groups")
    .select(`owner_id, ${MEMBER_COLUMNS}`)
    .eq("id", groupId)
    .single();

  if (error) throw error;
  if (data.owner_id !== userId) return { kind: "member" };

  const successor = pickSuccessor(toMembers(data.group_members), userId);

  return successor ? { kind: "transfer", successorName: successor.name } : { kind: "delete" };
}

// Une seule transaction côté serveur : en cas d'erreur, l'utilisateur est toujours membre.
export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_group", { target_group_id: groupId });
  if (error) throw error;
}

// Owner seulement (politique RLS « groups: dissous par son owner ») : la cascade efface
// membres, sessions, plats et votes. Les membres ne sont pas prévenus (notification : V1).
export async function deleteGroup(groupId: string): Promise<void> {
  const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select("id");

  if (error) throw error;
  // Un delete refusé par la RLS ne lève pas d'erreur : il supprime 0 ligne (cas 12 des tests
  // SQL). Sans ce contrôle, l'écran croirait à un succès alors que le groupe existe toujours.
  if (data.length === 0) {
    throw new Error("Groupe non supprimé : introuvable, ou l'utilisateur n'en est pas l'owner.");
  }
}
