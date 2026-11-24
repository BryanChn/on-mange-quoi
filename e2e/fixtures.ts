// Données de test : préparées par l'API (rapide et stable), le navigateur ne fait que ce
// qu'un invité fait. La clé service_role (locale) crée et supprime les comptes.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

type LocalSupabase = { url: string; anonKey: string; serviceRoleKey: string };

// URL et clés lues dans `supabase status`, comme tests/integration/local-supabase.ts.
function readLocalSupabase(): LocalSupabase {
  const output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(output) as Record<string, string>;
  const local = {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
  // Garde-fou : la clé service_role contourne la RLS, jamais vers le projet en ligne.
  const { hostname } = new URL(local.url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Les tests e2e refusent une base distante (${hostname}).`);
  }
  return local;
}

const local = readLocalSupabase();
const admin = createClient(local.url, local.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = randomUUID().slice(0, 8);
const createdSoirees: string[] = [];
const createdUsers: string[] = [];

export type ReadySoiree = { id: string; joinToken: string; ownerName: string };

// Un membre crée la soirée et fixe le resto : la commande est ouverte, on peut rejoindre.
export async function createSoireeReadyToOrder(
  restaurant: string,
  ownerName = "Sam",
): Promise<ReadySoiree> {
  const email = `e2e-${runId}-${createdUsers.length}@example.test`;
  const password = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  createdUsers.push(created.user.id);

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, display_name: ownerName });
  if (profileError) throw profileError;

  // Le chemin de l'app : connecté en tant que membre, RLS et fonctions SQL comprises.
  const owner = createClient(local.url, local.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await owner.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: soiree, error: createError } = await owner.rpc("create_soiree", {
    soiree_name: `Soirée ${runId}`,
  });
  if (createError) throw createError;
  createdSoirees.push(soiree.id);

  const { error: chooseError } = await owner.rpc("choose_restaurant", {
    target_group_id: soiree.id,
    restaurant_name: restaurant,
  });
  if (chooseError) throw chooseError;

  return { id: soiree.id, joinToken: soiree.join_token, ownerName };
}

// Supprime les soirées et tous leurs participants, invités anonymes compris.
export async function cleanup(): Promise<void> {
  for (const soireeId of createdSoirees) {
    const { data: members } = await admin
      .from("group_members")
      .select("profile_id")
      .eq("group_id", soireeId);
    for (const member of members ?? []) createdUsers.push(member.profile_id);
    await admin.from("groups").delete().eq("id", soireeId);
  }
  for (const userId of new Set(createdUsers)) {
    await admin.auth.admin.deleteUser(userId);
  }
}
