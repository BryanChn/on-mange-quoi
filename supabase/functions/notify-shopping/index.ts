// notify-shopping : « Je pars faire les courses » (aux autres membres du foyer) et ce qu'ils
// ajoutent pendant ce temps (à celui qui fait les courses). Appelée par le trigger
// shopping_trips_notify_started et par send_shopping_additions (pg_cron, toutes les 30 s),
// jamais par l'app.

import {
  internalError,
  json,
  reachableTokens,
  rejectUnlessInternal,
  sendPushMessages,
  serviceClient,
} from "../_shared/server.ts";
import { addedBody, buildShoppingMessages, parseShoppingRequest, startedBody } from "./messages.ts";

Deno.serve(async (request) => {
  const rejected = rejectUnlessInternal(request);
  if (rejected) return rejected;

  const shopping = parseShoppingRequest(await request.json().catch(() => null));
  if (!shopping) return json(400, { error: "invalid_body" });

  const supabase = serviceClient();

  // On ne fait confiance qu'à l'identifiant (et à la fenêtre) : tout le reste est relu en base.
  const { data: trip, error: tripError } = await supabase
    .from("shopping_trips")
    .select("id, group_id, shopper_id, ends_at, announced")
    .eq("id", shopping.tripId)
    .maybeSingle();
  if (tripError) return internalError("Lecture du passage", tripError);
  // Passage effacé ou déjà terminé (« J'ai fini ») : plus rien à dire.
  if (!trip || Date.parse(trip.ends_at) <= Date.now()) {
    return json(200, { sent: 0, skipped: "stale_event" });
  }

  const [groupResult, membersResult] = await Promise.all([
    supabase.from("groups").select("name").eq("id", trip.group_id).single(),
    supabase
      .from("group_members")
      .select("profile_id, profile:profiles(display_name)")
      .eq("group_id", trip.group_id),
  ]);
  if (groupResult.error) return internalError("Lecture du foyer", groupResult.error);
  if (membersResult.error) return internalError("Lecture des membres", membersResult.error);
  const members = membersResult.data ?? [];

  let body: string | null;
  let memberIds: string[];
  if (shopping.kind === "started") {
    if (!trip.announced) return json(200, { sent: 0, skipped: "not_announced" });
    const shopper = members.find((member) => member.profile_id === trip.shopper_id);
    const name = (shopper?.profile as { display_name: string } | null)?.display_name;
    body = startedBody(name ?? "Quelqu'un");
    // Les autres : celui qui part sait qu'il part.
    memberIds = members
      .map((member) => member.profile_id as string)
      .filter((id) => id !== trip.shopper_id);
  } else {
    // Ce que les autres ont ajouté dans la fenêtre, toujours à prendre.
    const { data: items, error: itemsError } = await supabase
      .from("shopping_items")
      .select("label, quantity, added_by")
      .eq("group_id", trip.group_id)
      .gt("created_at", shopping.since)
      .lte("created_at", shopping.until)
      .is("checked_at", null)
      .is("cleared_at", null)
      .order("created_at");
    if (itemsError) return internalError("Lecture des articles", itemsError);
    body = addedBody((items ?? []).filter((item) => item.added_by !== trip.shopper_id));
    memberIds = [trip.shopper_id];
  }
  if (body === null) return json(200, { sent: 0, skipped: "nothing_new" });

  let recipients;
  try {
    recipients = await reachableTokens(supabase, trip.group_id, memberIds, "shopping");
  } catch (error) {
    return internalError("Lecture des réglages et des jetons", error);
  }

  const messages = buildShoppingMessages(trip.group_id, groupResult.data.name, recipients, body);
  return json(200, await sendPushMessages(supabase, messages));
});
