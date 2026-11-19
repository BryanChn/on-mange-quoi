// Remplace src/lib/supabase.ts pendant les tests (voir register.ts) : même API exportée
// (`supabase`, `getUserId`), mais sans React Native et sans session persistée.
// Un seul client, comme dans l'app : signInAs (fixtures.ts) change le compte connecté.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/database.types.ts";
import { localSupabase } from "./local-supabase.ts";

export const supabase = createClient<Database>(localSupabase.url, localSupabase.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  if (!userId) throw new Error("Aucun compte connecté.");
  return userId;
}
