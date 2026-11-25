// Briques Deno communes aux fonctions internes (notify-vote, notify-meal, push-receipts).
// Elles sont appelées par la base (pg_net, pg_cron), jamais par l'app : pas de JWT
// (verify_jwt = false), un secret partagé EDGE_FUNCTIONS_SECRET dans l'en-tête
// x-internal-secret à la place. Le même secret est rangé dans Vault côté base.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import {
  chunk,
  EXPO_PUSH_URL,
  EXPO_SEND_BATCH_SIZE,
  safeEqual,
  ticketsToTrack,
  tokensToForget,
  type ExpoMessage,
  type ExpoTicket,
  type TrackedTicket,
} from "./expo-push.ts";
import type { NotificationCategory } from "./notification-category.ts";

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Le détail d'une erreur reste dans les logs de la fonction (tableau de bord Supabase) :
// la réponse ne dit rien de la base à qui l'appelle.
export function internalError(context: string, error: unknown): Response {
  console.error(context, error);
  return json(500, { error: "internal_error" });
}

// null si l'appel est autorisé, sinon la réponse d'erreur à renvoyer.
export function rejectUnlessInternal(request: Request): Response | null {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("EDGE_FUNCTIONS_SECRET");
  if (!secret || !safeEqual(request.headers.get("x-internal-secret") ?? "", secret)) {
    return json(401, { error: "unauthorized" });
  }
  return null;
}

// Clé service_role : contourne la RLS (jetons de tous les membres). Fournie par Supabase à
// la fonction, elle n'existe que côté serveur.
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// Appel à l'API d'Expo. Jeton d'accès facultatif tant que la « sécurité renforcée des push »
// n'est pas activée sur expo.dev, prêt pour le jour où elle le sera.
// null si Expo refuse la requête entière (quota, panne) : l'appelant ne supprime alors rien.
export async function postToExpo<T>(url: string, body: unknown): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    console.error("Expo a refusé la requête", url, response.status, await response.text());
    return null;
  }
  const { data } = (await response.json()) as { data: T };
  return data;
}


// Les téléphones à prévenir parmi ces membres : ceux qui n'ont pas coupé la catégorie dans
// Mon compte (pas de ligne de réglages = tout est activé). On ne lit même pas les jetons
// des autres.
export async function reachableTokens(
  supabase: SupabaseClient,
  memberIds: string[],
  category: NotificationCategory,
): Promise<{ profileId: string; token: string }[]> {
  if (memberIds.length === 0) return [];
  const { data: mutedRows, error: mutedError } = await supabase
    .from("notification_settings")
    .select("profile_id")
    .in("profile_id", memberIds)
    .eq(category, false);
  if (mutedError) throw mutedError;
  const muted = new Set((mutedRows ?? []).map((row) => row.profile_id as string));
  const reachable = memberIds.filter((id) => !muted.has(id));
  if (reachable.length === 0) return [];

  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", reachable);
  if (tokensError) throw tokensError;
  return (tokens ?? []).map((row) => ({ profileId: row.profile_id, token: row.token }));
}

// Envoie à Expo par lots, supprime les jetons refusés dès le ticket (DeviceNotRegistered) et
// garde les tickets acceptés pour push-receipts. Les notifications sont parties : un échec
// de ce rangement se journalise sans faire échouer l'appel.
export async function sendPushMessages(
  supabase: SupabaseClient,
  messages: ExpoMessage[],
): Promise<{ sent: number; forgotten: number; tracked: number }> {
  const forgotten: string[] = [];
  const tracked: TrackedTicket[] = [];
  for (const batch of chunk(messages, EXPO_SEND_BATCH_SIZE)) {
    const tickets = (await postToExpo<ExpoTicket[]>(EXPO_PUSH_URL, batch)) ?? [];
    forgotten.push(...tokensToForget(batch, tickets));
    tracked.push(...ticketsToTrack(batch, tickets));
  }

  if (forgotten.length > 0) {
    const { error } = await supabase.from("push_tokens").delete().in("token", forgotten);
    if (error) console.error("Suppression des jetons morts impossible", error);
  }
  if (tracked.length > 0) {
    // push-receipts lira leurs reçus plus tard (pg_cron, toutes les 30 min).
    const { error } = await supabase.from("push_tickets").insert(tracked);
    if (error) console.error("Enregistrement des tickets impossible", error);
  }
  return { sent: messages.length, forgotten: forgotten.length, tracked: tracked.length };
}
