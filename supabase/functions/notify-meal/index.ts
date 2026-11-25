// notify-meal : les notifications d'un repas autres que ses votes.
//   digest   : le résumé (qui a rejoint, qui apporte quoi), pour l'organisateur (1 min
//              environ) ou pour les autres (30 min au plus) ; send_meal_digests, toutes les 30 s.
//   ordered  : « C'est commandé », aux participants ; trigger groups_notify_meal_ordered.
//   meal_day : le rappel du jour d'un repas chez quelqu'un ; send_meal_day_reminders.
// Jamais appelée par l'app.

import {
  internalError,
  json,
  reachableTokens,
  rejectUnlessInternal,
  sendPushMessages,
  serviceClient,
} from "../_shared/server.ts";
import { buildDigestMessages, recipientsFor, type Arrival, type Contribution } from "./digest.ts";
import { buildMealMessages, mealDayBody, orderedBody, parseMealRequest } from "./events.ts";

Deno.serve(async (request) => {
  const rejected = rejectUnlessInternal(request);
  if (rejected) return rejected;

  const meal = parseMealRequest(await request.json().catch(() => null));
  if (!meal) return json(400, { error: "invalid_body" });

  const supabase = serviceClient();

  // On ne fait confiance qu'à l'identifiant et à la fenêtre : tout le reste est relu en base.
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, owner_id, kind, soiree_mode, soiree_step, restaurant, meal_date")
    .eq("id", meal.groupId)
    .maybeSingle();
  if (groupError) return internalError("Lecture du repas", groupError);
  // Repas effacé entre-temps, ou pas un repas : rien à dire.
  if (!group || group.kind !== "soiree") return json(200, { sent: 0, skipped: "not_a_meal" });

  if (meal.kind === "ordered" || meal.kind === "meal_day") {
    // L'état a pu changer depuis l'appel : on ne prévient que s'il est toujours vrai.
    const isStillTrue =
      meal.kind === "ordered" ? group.soiree_step === "passee" : group.soiree_mode === "maison";
    if (!isStillTrue) return json(200, { sent: 0, skipped: "stale_event" });

    const [membersResult, contributionsResult] = await Promise.all([
      supabase.from("group_members").select("profile_id").eq("group_id", group.id),
      meal.kind === "meal_day"
        ? supabase
            .from("soiree_contributions")
            .select("profile_id, label")
            .eq("group_id", group.id)
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (membersResult.error) return internalError("Lecture des membres", membersResult.error);
    if (contributionsResult.error) {
      return internalError("Lecture des apports", contributionsResult.error);
    }

    // Commande passée : le responsable vient de le faire, il est au courant.
    const memberIds = (membersResult.data ?? [])
      .map((member) => member.profile_id as string)
      .filter((id) => meal.kind === "meal_day" || id !== group.owner_id);
    let recipients;
    try {
      recipients = await reachableTokens(supabase, group.id, memberIds, "meals");
    } catch (error) {
      return internalError("Lecture des réglages et des jetons", error);
    }

    const contributions = contributionsResult.data ?? [];
    const messages = buildMealMessages(group.id, group.name, recipients, (profileId) =>
      meal.kind === "ordered"
        ? orderedBody(group.restaurant)
        : mealDayBody(
            contributions
              .filter((contribution) => contribution.profile_id === profileId)
              .map((contribution) => contribution.label as string),
          ),
    );
    return json(200, await sendPushMessages(supabase, messages));
  }

  const digest = meal;

  let contributionsQuery = supabase
    .from("soiree_contributions")
    .select("profile_id, label, created_at")
    .eq("group_id", group.id)
    .lte("created_at", digest.until)
    .order("created_at");
  if (digest.since) contributionsQuery = contributionsQuery.gt("created_at", digest.since);

  const [membersResult, contributionsResult] = await Promise.all([
    supabase
      .from("group_members")
      .select("profile_id, joined_at, profile:profiles(display_name)")
      .eq("group_id", group.id)
      .order("joined_at"),
    contributionsQuery,
  ]);
  if (membersResult.error) return internalError("Lecture des membres", membersResult.error);
  if (contributionsResult.error) {
    return internalError("Lecture des apports", contributionsResult.error);
  }

  const members = membersResult.data ?? [];
  const nameById = new Map(
    members.map((member) => [
      member.profile_id as string,
      (member.profile as { display_name: string } | null)?.display_name ?? "Quelqu'un",
    ]),
  );
  // Des instants, pas des textes : la base et pg_net n'écrivent pas l'heure au même format.
  const until = Date.parse(digest.until);
  const since = digest.since === null ? null : Date.parse(digest.since);
  const inWindow = (value: string) => {
    const instant = Date.parse(value);
    return instant <= until && (since === null || instant > since);
  };

  // Le responsable entre dans son repas à la création : ce n'est pas une nouvelle. Quelqu'un
  // qui est reparti n'est plus membre : il n'apparaît pas.
  const arrivals: Arrival[] = members
    .filter((member) => member.profile_id !== group.owner_id && inWindow(member.joined_at))
    .map((member) => ({ profileId: member.profile_id, name: nameById.get(member.profile_id)! }));
  // Les apports d'une personne retirée partent avec elle (cascade) : il ne reste que les vrais.
  const contributions: Contribution[] = (contributionsResult.data ?? []).map((row) => ({
    profileId: row.profile_id,
    name: nameById.get(row.profile_id) ?? "Quelqu'un",
    label: row.label,
  }));
  if (arrivals.length === 0 && contributions.length === 0) {
    return json(200, { sent: 0, skipped: "nothing_new" });
  }

  let recipients;
  try {
    recipients = await reachableTokens(
      supabase,
      group.id,
      members.map((member) => member.profile_id),
      "meals",
    );
  } catch (error) {
    return internalError("Lecture des réglages et des jetons", error);
  }

  const messages = buildDigestMessages({
    groupId: group.id,
    groupName: group.name,
    arrivals,
    contributions,
    recipients: recipientsFor(digest.audience, group.owner_id, recipients),
  });
  return json(200, await sendPushMessages(supabase, messages));
});
