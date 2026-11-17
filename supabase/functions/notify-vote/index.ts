// notify-vote : envoie les notifications push d'un vote (lancement, résultat).
// Appelée par le trigger notify_vote_session (pg_net), jamais par l'app.
// Déployée sans vérification JWT (--no-verify-jwt) : elle exige à la place le secret partagé
// NOTIFY_VOTE_SECRET dans l'en-tête x-notify-secret.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

import {
  buildMessages,
  chunk,
  EXPO_BATCH_SIZE,
  parseNotifyRequest,
  safeEqual,
  tokensToForget,
  type ExpoMessage,
  type ExpoTicket,
} from "./messages.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("NOTIFY_VOTE_SECRET");
  if (!secret || !safeEqual(request.headers.get("x-notify-secret") ?? "", secret)) {
    return json(401, { error: "unauthorized" });
  }

  const notify = parseNotifyRequest(await request.json().catch(() => null));
  if (!notify) return json(400, { error: "invalid_body" });

  // Clé service_role : lit les jetons de tous les membres (la RLS les cache à chacun).
  // Disponible seulement côté serveur, fournie par Supabase à la fonction.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // On ne fait confiance qu'à l'identifiant : tout le reste est relu en base.
  const { data: session, error: sessionError } = await supabase
    .from("vote_sessions")
    .select("id, group_id, organizer_id, status, winner_proposal_id")
    .eq("id", notify.sessionId)
    .maybeSingle();
  if (sessionError) return json(500, { error: sessionError.message });
  if (!session) return json(404, { error: "session_not_found" });

  // Vote déjà clôturé avant l'envoi du lancement : prévenir ne servirait plus à rien.
  const expectedStatus = notify.event === "opened" ? "open" : "closed";
  if (session.status !== expectedStatus) return json(200, { sent: 0, skipped: "stale_event" });

  const [groupResult, organizerResult, winnerResult, membersResult] = await Promise.all([
    supabase.from("groups").select("name").eq("id", session.group_id).single(),
    session.organizer_id
      ? supabase.from("profiles").select("display_name").eq("id", session.organizer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    session.winner_proposal_id
      ? supabase.from("proposals").select("name").eq("id", session.winner_proposal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("group_members").select("profile_id").eq("group_id", session.group_id),
  ]);
  const firstError = [groupResult, organizerResult, winnerResult, membersResult].find(
    (result) => result.error,
  )?.error;
  if (firstError) return json(500, { error: firstError.message });

  const memberIds = (membersResult.data ?? []).map((member) => member.profile_id);
  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", memberIds);
  if (tokensError) return json(500, { error: tokensError.message });

  const messages = buildMessages({
    event: notify.event,
    sessionId: session.id,
    groupName: groupResult.data!.name,
    organizerId: session.organizer_id,
    organizerName: organizerResult.data?.display_name ?? null,
    winnerName: winnerResult.data?.name ?? null,
    recipients: (tokens ?? []).map((row) => ({ profileId: row.profile_id, token: row.token })),
  });

  const forgotten: string[] = [];
  for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
    const tickets = await sendToExpo(batch);
    forgotten.push(...tokensToForget(batch, tickets));
  }

  if (forgotten.length > 0) {
    const { error } = await supabase.from("push_tokens").delete().in("token", forgotten);
    if (error) console.error("Suppression des jetons morts impossible", error);
  }

  return json(200, { sent: messages.length, forgotten: forgotten.length });
});

async function sendToExpo(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  // Jeton d'accès Expo : facultatif tant que la « sécurité renforcée des push » n'est pas
  // activée sur expo.dev, prêt pour le jour où elle le sera.
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    // Requête entière refusée (quota, panne) : on journalise, sans supprimer aucun jeton.
    console.error("Expo a refusé l'envoi", response.status, await response.text());
    return [];
  }
  const { data } = (await response.json()) as { data: ExpoTicket[] };
  return data;
}
