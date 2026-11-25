// Logique pure de notify-shopping (migration shopping_trips) : « Je pars faire les courses »
// et ce que le foyer ajoute pendant ce temps. Testée avec node --test (messages.test.ts).

import type { ExpoMessage } from "../_shared/expo-push.ts";

export type ShoppingRequest =
  | { kind: "started"; tripId: string }
  | { kind: "added"; tripId: string; since: string; until: string };

export type Recipient = { profileId: string; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// Le corps vient de la base, mais l'URL de la fonction est publique : on valide tout.
export function parseShoppingRequest(body: unknown): ShoppingRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { trip_id: tripId, kind, since, until } = body as Record<string, unknown>;
  if (typeof tripId !== "string" || !UUID.test(tripId)) return null;
  if (kind === "started") return { kind, tripId };
  if (kind === "added" && isInstant(since) && isInstant(until)) {
    return { kind, tripId, since, until };
  }
  return null;
}

export function startedBody(shopperName: string): string {
  return `${shopperName} part faire les courses. Besoin de quelque chose ? Ajoute-le à la liste.`;
}

// « À prendre aussi : lait (2), œufs. » null : rien à dire.
export function addedBody(items: { label: string; quantity: string | null }[]): string | null {
  if (items.length === 0) return null;
  const list = items.map((item) => (item.quantity ? `${item.label} (${item.quantity})` : item.label));
  return `À prendre aussi : ${list.join(", ")}.`;
}

export function buildShoppingMessages(
  groupId: string,
  groupName: string,
  recipients: Recipient[],
  body: string,
): ExpoMessage[] {
  const tokens = [...new Set(recipients.map((recipient) => recipient.token))];
  return tokens.map((token) => ({
    to: token,
    title: groupName,
    body,
    // Lu par l'app (notification-link.ts) pour ouvrir la liste au toucher.
    data: { coursesGroupId: groupId },
    sound: "default",
    channelId: "default",
    priority: "high",
  }));
}
