// Logique pure de notify-vote : quel corps accepter, qui prévenir et avec quel texte.
// Testée avec node --test (messages.test.ts). Le reste de l'API Expo est dans _shared.

import type { ExpoMessage } from "../_shared/expo-push.ts";

export type VoteEvent = "opened" | "closed";

export type NotifyRequest = { sessionId: string; event: VoteEvent };

// Un téléphone à prévenir : le jeton et le membre à qui il appartient.
export type Recipient = { profileId: string; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le corps vient du trigger, mais l'URL de la fonction est publique : on valide tout.
export function parseNotifyRequest(body: unknown): NotifyRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { session_id: sessionId, event } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) return null;
  if (event !== "opened" && event !== "closed") return null;
  return { sessionId, event };
}

type MessageInput = {
  event: VoteEvent;
  sessionId: string;
  groupName: string;
  organizerId: string | null;
  organizerName: string | null;
  winnerName: string | null;
  recipients: Recipient[];
};

// Lancement : les autres membres (l'organisateur sait qu'il vient de lancer le vote).
// Résultat : tout le groupe, organisateur compris (il n'est peut-être plus sur l'écran).
export function buildMessages(input: MessageInput): ExpoMessage[] {
  const recipients =
    input.event === "opened"
      ? input.recipients.filter((recipient) => recipient.profileId !== input.organizerId)
      : input.recipients;

  const body =
    input.event === "opened"
      ? `${input.organizerName ?? "Quelqu'un"} a lancé un vote : propose et vote !`
      : input.winnerName
        ? `C'est décidé : ${input.winnerName}. Bon appétit !`
        : "Le vote est terminé.";

  // Un même jeton ne doit sonner qu'une fois, même s'il apparaît deux fois.
  const tokens = [...new Set(recipients.map((recipient) => recipient.token))];

  return tokens.map((token) => ({
    to: token,
    title: input.groupName,
    body,
    // Lu par l'app (notification-link.ts) pour ouvrir le vote au toucher.
    data: { sessionId: input.sessionId },
    sound: "default",
    channelId: "default",
    priority: "high",
  }));
}
