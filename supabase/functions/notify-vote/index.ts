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
import { buildMessages, menuIfLast, notificationCategory, parseNotifyRequest, type MealMode, type MenuDish, type VoteTopic } from "./messages.ts";

Deno.serve(async (request) => {
  const rejected = rejectUnlessInternal(request);
  if (rejected) return rejected;

  const notify = parseNotifyRequest(await request.json().catch(() => null));
  if (!notify) return json(400, { error: "invalid_body" });

  const supabase = serviceClient();

  // On ne fait confiance qu'à l'identifiant : tout le reste est relu en base.
  const { data: session, error: sessionError } = await supabase
    .from("vote_sessions")
    .select("id, group_id, organizer_id, status, winner_proposal_id, topic")
    .eq("id", notify.sessionId)
    .maybeSingle();
  if (sessionError) return internalError("Lecture de la session", sessionError);
  if (!session) return json(404, { error: "session_not_found" });

  // Vote déjà clôturé avant l'envoi du lancement ou du rappel : prévenir ne servirait plus à rien.
  const expectedStatus = notify.event === "closed" ? "closed" : "open";
  if (session.status !== expectedStatus) return json(200, { sent: 0, skipped: "stale_event" });

  const [groupResult, organizerResult, winnerResult, membersResult, proposalsResult] = await Promise.all([
    supabase.from("groups").select("name, soiree_mode").eq("id", session.group_id).single(),
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

  // Repas « maison » : le menu n'est annoncé qu'à la fin du dernier vote, avec tous ses plats.
  const mealMode = (groupResult.data!.soiree_mode ?? null) as MealMode | null;
  let menu: MenuDish[] | null = null;
  if (mealMode === "maison" && notify.event === "closed") {
    const { data: votes, error: votesError } = await supabase
      .from("vote_sessions")
      .select("id, topic, status, closed_at, winner:proposals!vote_sessions_winner_fk(name)")
      .eq("group_id", session.group_id);
    if (votesError) return internalError("Lecture du menu", votesError);
    menu = menuIfLast(
      (votes ?? []).map((vote) => ({
        id: vote.id,
        topic: vote.topic as VoteTopic,
        status: vote.status as "open" | "closed",
        closedAt: vote.closed_at,
        winnerName: (vote.winner as { name: string } | null)?.name ?? null,
      })),
      session.id,
    );
  }

  // Membres qui ont coupé cette catégorie dans Mon compte : on ne lit même pas leurs jetons.
  // Pas de ligne de réglages = tout est activé.
  const category = notificationCategory(mealMode);
  const allMemberIds = (membersResult.data ?? []).map((member) => member.profile_id);
  const { data: mutedRows, error: mutedError } = await supabase
    .from("notification_settings")
    .select("profile_id")
    .in("profile_id", allMemberIds)
    .eq(category, false);
  if (mutedError) return internalError("Lecture des réglages", mutedError);
  const muted = new Set((mutedRows ?? []).map((row) => row.profile_id));
  const memberIds = allMemberIds.filter((id) => !muted.has(id));
  const { data: tokens, error: tokensError } = await supabase
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", memberIds);
  if (tokensError) return internalError("Lecture des jetons", tokensError);

  const messages = buildMessages({
    event: notify.event,
    sessionId: session.id,
    groupName: groupResult.data!.name,
    mealMode,
    topic: session.topic as VoteTopic,
    menu,
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
