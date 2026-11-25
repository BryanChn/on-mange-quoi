// notify-meal : le résumé d'un repas (qui a rejoint, qui apporte quoi), une notification
// regroupée, pour l'organisateur (1 min environ) ou pour les autres (30 min au plus).
// Appelée par send_meal_digests (pg_cron, toutes les 30 s), jamais par l'app.

import {
  internalError,
  json,
  reachableTokens,
  rejectUnlessInternal,
  sendPushMessages,
  serviceClient,
} from "../_shared/server.ts";
import {
  buildDigestMessages,
  parseDigestRequest,
  recipientsFor,
  type Arrival,
  type Contribution,
} from "./digest.ts";

Deno.serve(async (request) => {
  const rejected = rejectUnlessInternal(request);
  if (rejected) return rejected;

  const digest = parseDigestRequest(await request.json().catch(() => null));
  if (!digest) return json(400, { error: "invalid_body" });

  const supabase = serviceClient();

  // On ne fait confiance qu'à l'identifiant et à la fenêtre : tout le reste est relu en base.
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, owner_id, kind")
    .eq("id", digest.groupId)
    .maybeSingle();
  if (groupError) return internalError("Lecture du repas", groupError);
  // Repas effacé entre-temps, ou pas un repas : rien à dire.
  if (!group || group.kind !== "soiree") return json(200, { sent: 0, skipped: "not_a_meal" });

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
