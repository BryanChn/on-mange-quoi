// Briques Deno communes aux fonctions internes (notify-vote, push-receipts).
// Elles sont appelées par la base (pg_net, pg_cron), jamais par l'app : pas de JWT
// (verify_jwt = false), un secret partagé EDGE_FUNCTIONS_SECRET dans l'en-tête
// x-internal-secret à la place. Le même secret est rangé dans Vault côté base.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

import { safeEqual } from "./expo-push.ts";

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
