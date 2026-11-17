// push-receipts : lit les reçus d'Expo et supprime les jetons morts qu'ils signalent.
// Appelée toutes les 30 min par pg_cron (migration push_receipts), jamais par l'app.
// Les reçus arrivent environ 15 min après l'envoi et sont gardés 24 h par Expo.

import {
  chunk,
  EXPO_RECEIPTS_BATCH_SIZE,
  EXPO_RECEIPTS_URL,
  readReceipts,
  type ExpoReceipt,
  type TrackedTicket,
} from "../_shared/expo-push.ts";
import { internalError, json, postToExpo, rejectUnlessInternal, serviceClient } from "../_shared/server.ts";

// Au plus 1 000 tickets par passage : on reprend au suivant s'il en reste.
const MAX_TICKETS_PER_RUN = 1000;

Deno.serve(async (request) => {
  const rejected = rejectUnlessInternal(request);
  if (rejected) return rejected;

  const supabase = serviceClient();
  const now = Date.now();
  const readyBefore = new Date(now - 15 * 60 * 1000).toISOString();
  const expiredBefore = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Reçus effacés par Expo après 24 h : ces tickets ne diront plus rien.
  const { error: expireError } = await supabase
    .from("push_tickets")
    .delete()
    .lt("created_at", expiredBefore);
  if (expireError) return internalError("Purge des tickets expirés", expireError);

  const { data: rows, error: readError } = await supabase
    .from("push_tickets")
    .select("id, token")
    .lt("created_at", readyBefore)
    .order("created_at")
    .limit(MAX_TICKETS_PER_RUN);
  if (readError) return internalError("Lecture des tickets", readError);

  const tracked: TrackedTicket[] = rows ?? [];
  const receipts: Record<string, ExpoReceipt> = {};
  for (const batch of chunk(tracked, EXPO_RECEIPTS_BATCH_SIZE)) {
    const data = await postToExpo<Record<string, ExpoReceipt>>(EXPO_RECEIPTS_URL, {
      ids: batch.map((ticket) => ticket.id),
    });
    Object.assign(receipts, data ?? {});
  }

  const { forget, settled } = readReceipts(tracked, receipts);

  // Supprimer le jeton supprime aussi ses tickets (on delete cascade).
  if (forget.length > 0) {
    const { error } = await supabase.from("push_tokens").delete().in("token", forget);
    if (error) return internalError("Suppression des jetons morts", error);
  }
  if (settled.length > 0) {
    const { error } = await supabase.from("push_tickets").delete().in("id", settled);
    if (error) return internalError("Suppression des tickets traités", error);
  }

  return json(200, { checked: tracked.length, settled: settled.length, forgotten: forget.length });
});
