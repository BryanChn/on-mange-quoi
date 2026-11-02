import type { Tables } from "./database.types";
import { supabase } from "./supabase";

export type Group = Pick<Tables<"groups">, "id" | "name">;

// Pas de filtre sur l'utilisateur : la RLS ne renvoie déjà que ses groupes.
export async function fetchGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}
