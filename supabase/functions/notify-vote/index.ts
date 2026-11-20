// notify-vote : envoie les notifications push d'un vote (lancement, résultat, rappel).
// Appelée par le trigger notify_vote_session et par send_vote_reminders (pg_net), jamais
// par l'app.

import {
  chunk,
  EXPO_PUSH_URL,
  EXPO_SEND_BATCH_SIZE,
  ticketsToTrack,
  tokensToForget,
  type ExpoTicket,
  type TrackedTicket,
} from "../_shared/expo-push.ts";
import { internalError, json, postToExpo, rejectUnlessInternal, serviceClient } from "../_shared/server.ts";
import { buildMessages, parseNotifyRequest } from "./messages.ts";

Deno.serve(async (request) => {
  const rejected = rejectUnlessInternal(request);
  if (rejected) return rejected;

  const notify = parseNotifyRequest(await request.json().catch(() => null));
  if (!notify) return json(400, { error: "invalid_body" });

  const supabase = serviceClient();

  // On ne fait confiance qu'à l'identifiant : tout le reste est relu en base.
  const { data: session, error: sessionError } = await supabase
    .from("vote_sessions")
    .select("id, group_id, organizer_id, status, winner_proposal_id")
    .eq("id", notify.sessionId)
    .maybeSingle();
  if (sessionError) return internalError("Lecture de la session", sessionError);
  if (!session) return json(404, { error: "session_not_found" });

  // Vote déjà clôturé avant l'envoi du lancement ou du rappel : prévenir ne servirait plus à rien.
  const expectedStatus = notify.event === "closed" ? "closed" : "open";
  if (session.status !== expectedStatus) return json(200, { sent: 0, skipped: "stale_event" });

  const [groupResult, organizerResult, winnerResult, membersResult, proposalsResult] = await Promise.all([
    supabase.from("groups").select("name").eq("id", session.group_id).single(),
    session.organizer_id
      ? supabase.from("profiles").select("display_name").eq("id", session.organizer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    session.winner_proposal_id
      ? supabase.from("proposals").select("name").eq("id", session.winner_proposal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("group_members").select("profile_id").eq("group_id", session.group_id),
    // Rappel : qui a déjà proposé ou voté, relu au moment de l'envoi.
    notify.event === "reminder"
      ? supabase.from("proposals").select("proposed_by, votes(profile_id)").eq("session_id", session.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const readError = [groupResult, organizerResult, winnerResult, membersResult, proposalsResult].find(
    (result) => result.error,
  )?.error;
  if (readError) return internalError("Lecture du groupe", readError);

  const memberIds = (membersResult.data ?? []).map((member) => member.profile_id);
  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", memberIds);
  if (tokensError) return internalError("Lecture des jetons", tokensError);

  const messages = buildMessages({
    event: notify.event,
    sessionId: session.id,
    groupName: groupResult.data!.name,
    organizerId: session.organizer_id,
    organizerName: organizerResult.data?.display_name ?? null,
    winnerName: winnerResult.data?.name ?? null,
    recipients: (tokens ?? []).map((row) => ({ profileId: row.profile_id, token: row.token })),
    participantIds: (proposalsResult.data ?? []).flatMap((proposal) => [
      ...(proposal.proposed_by ? [proposal.proposed_by] : []),
      ...proposal.votes.map((vote) => vote.profile_id),
    ]),
  });

  const forgotten: string[] = [];
  const tracked: TrackedTicket[] = [];
  for (const batch of chunk(messages, EXPO_SEND_BATCH_SIZE)) {
    const tickets = (await postToExpo<ExpoTicket[]>(EXPO_PUSH_URL, batch)) ?? [];
    forgotten.push(...tokensToForget(batch, tickets));
    tracked.push(...ticketsToTrack(batch, tickets));
  }

  // Les notifications sont parties : un échec ici se journalise sans faire échouer l'appel.
  if (forgotten.length > 0) {
    const { error } = await supabase.from("push_tokens").delete().in("token", forgotten);
    if (error) console.error("Suppression des jetons morts impossible", error);
  }
  if (tracked.length > 0) {
    // push-receipts lira leurs reçus plus tard (pg_cron, toutes les 30 min).
    const { error } = await supabase.from("push_tickets").insert(tracked);
    if (error) console.error("Enregistrement des tickets impossible", error);
  }

  return json(200, { sent: messages.length, forgotten: forgotten.length, tracked: tracked.length });
});
