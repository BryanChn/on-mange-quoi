// notify-vote : envoie les notifications push d'un vote (lancement, résultat, rappel).
// Appelée par le trigger notify_vote_session et par send_vote_reminders (pg_net), jamais
// par l'app.

import {
  internalError,
  json,
  reachableTokens,
  rejectUnlessInternal,
  sendPushMessages,
  serviceClient,
} from "../_shared/server.ts";
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
    .select("id, group_id, organizer_id, status, winner_proposal_id, topic, moment")
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

  // Seulement ceux qui n'ont pas coupé cette catégorie dans Mon compte.
  const memberIds = (membersResult.data ?? []).map((member) => member.profile_id);
  let recipients;
  try {
    recipients = await reachableTokens(
      supabase,
      session.group_id,
      memberIds,
      notificationCategory(mealMode),
    );
  } catch (error) {
    return internalError("Lecture des réglages et des jetons", error);
  }

  const messages = buildMessages({
    event: notify.event,
    sessionId: session.id,
    groupName: groupResult.data!.name,
    mealMode,
    topic: session.topic as VoteTopic,
    moment: (session.moment ?? null) as "midi" | "soir" | null,
    menu,
    organizerId: session.organizer_id,
    organizerName: organizerResult.data?.display_name ?? null,
    winnerName: winnerResult.data?.name ?? null,
    recipients,
    participantIds: (proposalsResult.data ?? []).flatMap((proposal) => [
      ...(proposal.proposed_by ? [proposal.proposed_by] : []),
      ...proposal.votes.map((vote) => vote.profile_id),
    ]),
  });

  return json(200, await sendPushMessages(supabase, messages));
});
