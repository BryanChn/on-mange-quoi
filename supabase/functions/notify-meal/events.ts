// Logique pure des autres notifications d'un repas (migration meal_ordered_and_day) :
// « C'est commandé » et le rappel du jour d'un repas chez quelqu'un. Le résumé est dans
// digest.ts. Testée avec node --test (events.test.ts).

import type { ExpoMessage } from "../_shared/expo-push.ts";
import { parseDigestRequest, type DigestRequest, type Recipient } from "./digest.ts";

export type MealRequest =
  | ({ kind: "digest" } & DigestRequest)
  | { kind: "ordered"; groupId: string }
  | { kind: "meal_day"; groupId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le corps vient de la base, mais l'URL de la fonction est publique : on valide tout. Sans
// « kind » : un résumé (les appels de send_meal_digests d'avant ce champ).
export function parseMealRequest(body: unknown): MealRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { kind, group_id: groupId } = body as Record<string, unknown>;
  if (kind === undefined || kind === "digest") {
    const digest = parseDigestRequest(body);
    return digest ? { kind: "digest", ...digest } : null;
  }
  if (kind !== "ordered" && kind !== "meal_day") return null;
  if (typeof groupId !== "string" || !UUID.test(groupId)) return null;
  return { kind, groupId };
}

// « chez Kebab Istanbul », mais « Chez Momo » tel quel (même règle que goingTo dans l'app).
function atRestaurant(restaurant: string): string {
  const name = restaurant.trim();
  return /^chez\s/i.test(name) ? name : `chez ${name}`;
}

export function orderedBody(restaurant: string | null): string {
  return restaurant
    ? `C'est commandé ${atRestaurant(restaurant)}. Plus qu'à attendre !`
    : "C'est commandé. Plus qu'à attendre !";
}

// Ce que cette personne apporte, ou une invitation à le dire.
export function mealDayBody(myLabels: string[]): string {
  return myLabels.length > 0
    ? `C'est aujourd'hui ! Tu apportes : ${myLabels.join(", ")}.`
    : "C'est aujourd'hui ! Dis ce que tu apportes.";
}

// Un message par téléphone ; bodyFor écrit pour chaque personne.
export function buildMealMessages(
  groupId: string,
  groupName: string,
  recipients: Recipient[],
  bodyFor: (profileId: string) => string,
): ExpoMessage[] {
  const seenTokens = new Set<string>();
  const messages: ExpoMessage[] = [];
  for (const recipient of recipients) {
    if (seenTokens.has(recipient.token)) continue;
    seenTokens.add(recipient.token);
    messages.push({
      to: recipient.token,
      title: groupName,
      body: bodyFor(recipient.profileId),
      // Lu par l'app (notification-link.ts) pour ouvrir le repas au toucher.
      data: { soireeId: groupId },
      sound: "default",
      channelId: "default",
      priority: "high",
    });
  }
  return messages;
}
