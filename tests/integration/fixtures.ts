// Comptes et groupes de test. Les comptes sont créés avec la clé service_role (locale
// uniquement), puis chaque action passe par le client de l'app, connecté en tant que membre :
// la RLS et les fonctions SQL s'appliquent comme sur un téléphone.
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/database.types.ts";
import { localSupabase } from "./local-supabase.ts";
import { supabase } from "./supabase-test-client.ts";

export type TestUser = { id: string; name: string; email: string; password: string };

const admin = createClient<Database>(localSupabase.url, localSupabase.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Identifie les comptes de cette exécution, pour ne supprimer qu'eux à la fin.
const runId = randomUUID().slice(0, 8);
const createdUsers: TestUser[] = [];

export async function createUser(name: string): Promise<TestUser> {
  const email = `test-${runId}-${name.toLowerCase()}@example.test`;
  const password = randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const user = { id: data.user.id, name, email, password };
  createdUsers.push(user);

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: user.id, display_name: name });
  if (profileError) throw profileError;

  return user;
}

export async function signInAs(user: TestUser): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
}

// Groupe créé par owner (create_group), rejoint par les autres avec le code (join_group) :
// le même chemin que dans l'app.
export async function createGroup(owner: TestUser, members: TestUser[]): Promise<string> {
  await signInAs(owner);
  const { data: group, error } = await supabase.rpc("create_group", {
    group_name: `Groupe ${runId}`,
  });
  if (error) throw error;

  for (const member of members) {
    await signInAs(member);
    const { error: joinError } = await supabase.rpc("join_group", { code: group.invite_code });
    if (joinError) throw joinError;
  }
  return group.id;
}

// Supprime les groupes puis les comptes de cette exécution (profiles et votes suivent en cascade).
export async function cleanUp(): Promise<void> {
  await supabase.auth.signOut();
  const ids = createdUsers.map((user) => user.id);
  if (ids.length === 0) return;

  const { error } = await admin.from("groups").delete().in("owner_id", ids);
  if (error) throw error;

  for (const id of ids) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw deleteError;
  }
}
