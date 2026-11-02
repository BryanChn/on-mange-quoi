import type { Tables } from "./database.types";
import { supabase } from "./supabase";

export type Group = Pick<Tables<"groups">, "id" | "name">;
export type GroupDetail = Pick<Tables<"groups">, "id" | "name" | "invite_code">;

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
    .select("id, name, invite_code")
    .eq("id", groupId)
    .single();

  if (error) throw error;
  return data;
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
