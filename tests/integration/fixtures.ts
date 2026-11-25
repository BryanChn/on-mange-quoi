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
  // Le rang rend l'email unique même si deux comptes portent le même nom.
  const email = `test-${runId}-${createdUsers.length}-${name.toLowerCase()}@example.test`;
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

// Vérifications avec la clé admin : elles voient au-delà de la RLS, pour constater qu'une
// ligne a vraiment disparu (et pas seulement qu'elle est masquée au compte connecté).
export async function groupExists(groupId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("id", groupId);
  if (error) throw error;
  return count === 1;
}

export async function countSessions(groupId: string): Promise<number> {
  const { count, error } = await admin
    .from("vote_sessions")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (error) throw error;
  return count ?? 0;
}

export async function userExists(userId: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user !== null;
}

export async function profileExists(userId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("id", userId);
  if (error) throw error;
  return count === 1;
}

// ─── invités anonymes (soirées) ──────────────────────────
// Un invité n'a ni email ni mot de passe : on garde les jetons de sa session pour pouvoir
// « redevenir » lui après être passé par un autre compte.
export type TestGuest = { id: string; accessToken: string; refreshToken: string };

const createdGuests: TestGuest[] = [];

export async function signInAsNewGuest(): Promise<TestGuest> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session || !data.user) throw new Error("Connexion anonyme sans session.");

  const guest = {
    id: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
  createdGuests.push(guest);
  return guest;
}

// Un invité créé par le code de l'app (joinSoiree se connecte lui-même) : à supprimer aussi.
export async function trackCurrentGuest(): Promise<TestGuest> {
  const { data } = await supabase.auth.getSession();
  if (!data.session || !data.session.user.is_anonymous) throw new Error("Pas d'invité connecté.");
  const guest = {
    id: data.session.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
  createdGuests.push(guest);
  return guest;
}

export async function signOutCompletely(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}

export async function signInAsGuest(guest: TestGuest): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: guest.accessToken,
    refresh_token: guest.refreshToken,
  });
  if (error) throw error;
}

// Remplit une soirée sans passer par le lien (test du plafond de 20) : clé admin.
export async function addMembersDirectly(groupId: string, users: TestUser[]): Promise<void> {
  const { error } = await admin
    .from("group_members")
    .insert(users.map((user) => ({ group_id: groupId, profile_id: user.id })));
  if (error) throw error;
}

// Fichiers de la photo de profil d'un compte (clé admin : voit au-delà des règles d'accès).
export async function listPhotos(userId: string): Promise<string[]> {
  const { data, error } = await admin.storage.from("avatars").list(userId);
  if (error) throw error;
  return data.map((file) => `${userId}/${file.name}`);
}

// Exécute ce que pg_cron lance toutes les heures, à l'heure choisie.
export async function purgeSoirees(referenceTime: Date): Promise<number> {
  const { data, error } = await admin.rpc("purge_soirees", {
    reference_time: referenceTime.toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function soireeOrderedAt(groupId: string): Promise<Date> {
  const { data, error } = await admin
    .from("groups")
    .select("ordered_at")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  if (!data.ordered_at) throw new Error("Soirée sans date de commande.");
  return new Date(data.ordered_at);
}

// Supprime les groupes puis les comptes de cette exécution (profiles et votes suivent en cascade).
// Les comptes déjà supprimés par un test (delete_account, purge) sont ignorés.
export async function cleanUp(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
  const guestIds = createdGuests.map((guest) => guest.id);
  if (guestIds.length > 0) {
    // Une soirée peut être passée à un invité (départ du responsable) : ses groupes d'abord.
    const { error } = await admin.from("groups").delete().in("owner_id", guestIds);
    if (error) throw error;
    for (const id of guestIds) {
      if (!(await userExists(id))) continue;
      const { error: deleteError } = await admin.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
    }
  }
  const ids = createdUsers.map((user) => user.id);
  if (ids.length === 0) return;

  const { error } = await admin.from("groups").delete().in("owner_id", ids);
  if (error) throw error;

  for (const id of ids) {
    if (!(await userExists(id))) continue;
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw deleteError;
  }
}

// ─── rappel unique (send_vote_reminders) ─────────────────
// Clé admin : created_at n'est pas modifiable par l'app (droits par colonne), et la fonction
// est réservée à pg_cron et à service_role.

// Antidate le lancement d'une session (simule « lancé il y a 70 min »).
export async function setSessionCreatedAt(sessionId: string, createdAt: Date): Promise<void> {
  const { error } = await admin
    .from("vote_sessions")
    .update({ created_at: createdAt.toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

// Exécute ce que pg_cron lance toutes les 10 minutes, à l'heure choisie.
export async function sendVoteReminders(referenceTime: Date): Promise<number> {
  const { data, error } = await admin.rpc("send_vote_reminders", {
    reference_time: referenceTime.toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function reminderSentAt(sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("vote_sessions")
    .select("reminder_sent_at")
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  return data.reminder_sent_at;
}

// ─── repas datés (meal_modes) ────────────────────────────
// Clé admin : la date et la création d'un repas ne sont pas modifiables par l'app.
// Simule un repas créé avant la migration (sans date) ou longtemps à l'avance.
export async function setSoireeDates(
  groupId: string,
  dates: { createdAt?: Date; mealDate?: string | null },
): Promise<void> {
  const update: { created_at?: string; meal_date?: string | null } = {};
  if (dates.createdAt) update.created_at = dates.createdAt.toISOString();
  if (dates.mealDate !== undefined) update.meal_date = dates.mealDate;
  const { error } = await admin.from("groups").update(update).eq("id", groupId);
  if (error) throw error;
}

// Résumé d'un repas (migration meal_digest) : ce que pg_cron lance toutes les 2 minutes, à
// l'heure choisie, et l'état du repas.
export async function sendMealDigests(referenceTime: Date): Promise<number> {
  const { data, error } = await admin.rpc("send_meal_digests", {
    reference_time: referenceTime.toISOString(),
  });
  if (error) throw error;
  return data;
}

export type MealDigestState = {
  pendingSince: string | null;
  sentAt: string | null;
  ownerPendingSince: string | null;
  ownerSentAt: string | null;
};

export async function mealDigestState(groupId: string): Promise<MealDigestState> {
  const { data, error } = await admin
    .from("groups")
    .select(
      "digest_pending_since, digest_sent_at, owner_digest_pending_since, owner_digest_sent_at",
    )
    .eq("id", groupId)
    .single();
  if (error) throw error;
  return {
    pendingSince: data.digest_pending_since,
    sentAt: data.digest_sent_at,
    ownerPendingSince: data.owner_digest_pending_since,
    ownerSentAt: data.owner_digest_sent_at,
  };
}

// Antidate les marques d'un repas (les triggers les posent « maintenant »).
export async function setMealDigest(
  groupId: string,
  marks: {
    pendingSince?: Date | null;
    sentAt?: Date | null;
    ownerPendingSince?: Date | null;
  },
): Promise<void> {
  const iso = (value: Date | null | undefined) =>
    value === undefined ? undefined : value === null ? null : value.toISOString();
  const { error } = await admin
    .from("groups")
    .update({
      digest_pending_since: iso(marks.pendingSince),
      digest_sent_at: iso(marks.sentAt),
      owner_digest_pending_since: iso(marks.ownerPendingSince),
    })
    .eq("id", groupId);
  if (error) throw error;
}

// Rappel du jour d'un repas (migration meal_ordered_and_day) : ce que pg_cron lance toutes les
// 15 minutes, à l'heure choisie ; la date du repas et sa création, antidatées.
export async function sendMealDayReminders(referenceTime: Date): Promise<number> {
  const { data, error } = await admin.rpc("send_meal_day_reminders", {
    reference_time: referenceTime.toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function setMealDates(
  groupId: string,
  mealDate: string,
  createdAt: Date,
): Promise<void> {
  const { error } = await admin
    .from("groups")
    .update({ meal_date: mealDate, created_at: createdAt.toISOString() })
    .eq("id", groupId);
  if (error) throw error;
}

export async function mealDayRemindedAt(groupId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("groups")
    .select("meal_day_reminded_at")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  return data.meal_day_reminded_at;
}

// Passages aux courses (migration shopping_trips) : ce que pg_cron lance toutes les 30 s, et
// l'état des passages d'un foyer, du plus récent au plus ancien.
export async function sendShoppingAdditions(referenceTime: Date): Promise<number> {
  const { data, error } = await admin.rpc("send_shopping_additions", {
    reference_time: referenceTime.toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function shoppingTrips(groupId: string): Promise<
  {
    shopperId: string;
    announced: boolean;
    addedPendingSince: string | null;
    addedSentAt: string | null;
  }[]
> {
  const { data, error } = await admin
    .from("shopping_trips")
    .select("shopper_id, announced, added_pending_since, added_sent_at")
    .eq("group_id", groupId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    shopperId: row.shopper_id,
    announced: row.announced,
    addedPendingSince: row.added_pending_since,
    addedSentAt: row.added_sent_at,
  }));
}
