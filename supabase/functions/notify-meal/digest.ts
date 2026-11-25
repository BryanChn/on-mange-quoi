// Logique pure de notify-meal : le résumé d'un repas (qui a rejoint, qui apporte quoi),
// écrit pour chaque destinataire. Testée avec node --test (digest.test.ts).

import type { ExpoMessage } from "../_shared/expo-push.ts";

// Envoyé par send_meal_digests (pg_cron) : le repas et la fenêtre du résumé.
// since = null : premier résumé du repas, tout ce qui précède until.
export type DigestRequest = { groupId: string; since: string | null; until: string };

// Quelqu'un qui a rejoint le repas pendant la fenêtre.
export type Arrival = { profileId: string; name: string };

// Un apport écrit pendant la fenêtre (« le pain »).
export type Contribution = { profileId: string; name: string; label: string };

export type Recipient = { profileId: string; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// Le corps vient de la base, mais l'URL de la fonction est publique : on valide tout.
export function parseDigestRequest(body: unknown): DigestRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { group_id: groupId, since, until } = body as Record<string, unknown>;
  if (typeof groupId !== "string" || !UUID.test(groupId)) return null;
  if (!isInstant(until)) return null;
  if (since !== null && !isInstant(since)) return null;
  return { groupId, since, until };
}

// Au-delà de 3 personnes, on compte au lieu de nommer : une notification se lit d'un coup
// d'œil.
const MAX_NAMED = 3;

// « Léa », « Léa et Tom », « Léa, Tom et Max », « Léa, Tom et 2 autres ».
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= MAX_NAMED) {
    return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
  }
  const others = names.length - 2;
  return `${names.slice(0, 2).join(", ")} et ${others} autres`;
}

function arrivalsSentence(arrivals: Arrival[]): string | null {
  if (arrivals.length === 0) return null;
  const names = listNames(arrivals.map((arrival) => arrival.name));
  return arrivals.length === 1 ? `${names} a rejoint.` : `${names} ont rejoint.`;
}

// « Léa apporte : le pain, le vin. » Une phrase par personne, dans l'ordre des apports.
function contributionsSentences(contributions: Contribution[]): string[] {
  const byPerson = new Map<string, { name: string; labels: string[] }>();
  for (const contribution of contributions) {
    const person = byPerson.get(contribution.profileId);
    if (person) {
      person.labels.push(contribution.label);
    } else {
      byPerson.set(contribution.profileId, { name: contribution.name, labels: [contribution.label] });
    }
  }
  const people = [...byPerson.values()];
  const named = people
    .slice(0, MAX_NAMED)
    .map((person) => `${person.name} apporte : ${person.labels.join(", ")}.`);
  const others = people.length - MAX_NAMED;
  if (others === 1) named.push("Et une autre personne apporte quelque chose.");
  if (others > 1) named.push(`Et ${others} autres personnes apportent quelque chose.`);
  return named;
}

// Ce que les AUTRES ont fait : on ne s'annonce pas sa propre arrivée. null : rien de neuf
// pour cette personne, pas de notification.
export function digestBody(
  arrivals: Arrival[],
  contributions: Contribution[],
  recipientId: string,
): string | null {
  const otherArrivals = arrivals.filter((arrival) => arrival.profileId !== recipientId);
  const otherContributions = contributions.filter(
    (contribution) => contribution.profileId !== recipientId,
  );
  const sentences = [
    arrivalsSentence(otherArrivals),
    ...contributionsSentences(otherContributions),
  ].filter((sentence): sentence is string => sentence !== null);
  return sentences.length > 0 ? sentences.join(" ") : null;
}

type DigestInput = {
  groupId: string;
  groupName: string;
  arrivals: Arrival[];
  contributions: Contribution[];
  // Membres du repas qui ont l'app et n'ont pas coupé « Repas à plusieurs ».
  recipients: Recipient[];
};

export function buildDigestMessages(input: DigestInput): ExpoMessage[] {
  const messages: ExpoMessage[] = [];
  const seenTokens = new Set<string>();
  for (const recipient of input.recipients) {
    // Un même jeton ne doit sonner qu'une fois.
    if (seenTokens.has(recipient.token)) continue;
    seenTokens.add(recipient.token);

    const body = digestBody(input.arrivals, input.contributions, recipient.profileId);
    if (body === null) continue;
    messages.push({
      to: recipient.token,
      title: input.groupName,
      body,
      // Lu par l'app (notification-link.ts) pour ouvrir le repas au toucher.
      data: { soireeId: input.groupId },
      sound: "default",
      channelId: "default",
      priority: "high",
    });
  }
  return messages;
}
