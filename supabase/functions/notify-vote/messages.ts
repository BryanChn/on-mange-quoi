// Logique pure de notify-vote : aucune dépendance à Deno ni au réseau, testée avec node --test
// (messages.test.ts). Extensions .ts explicites : Deno et Node les exigent tous les deux.

export type VoteEvent = "opened" | "closed";

export type NotifyRequest = { sessionId: string; event: VoteEvent };

// Un téléphone à prévenir : le jeton et le membre à qui il appartient.
export type Recipient = { profileId: string; token: string };

// Format attendu par l'API push d'Expo (un message = un téléphone).
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { sessionId: string };
  sound: "default";
  channelId: "default";
  priority: "high";
};

// Réponse d'Expo pour un message, dans le même ordre que l'envoi.
export type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Expo accepte au plus 100 messages par requête.
export const EXPO_BATCH_SIZE = 100;

// Le corps vient du trigger, mais l'URL de la fonction est publique : on valide tout.
export function parseNotifyRequest(body: unknown): NotifyRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { session_id: sessionId, event } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) return null;
  if (event !== "opened" && event !== "closed") return null;
  return { sessionId, event };
}

// Comparaison en temps constant : un « === » s'arrête au premier caractère différent, et le
// temps de réponse laisserait deviner le secret caractère par caractère (attaque temporelle).
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
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
      : `C'est réglé : ${input.winnerName ?? "le vote est terminé"}`;

  // Un même jeton ne doit sonner qu'une fois, même s'il apparaît deux fois.
  const tokens = [...new Set(recipients.map((recipient) => recipient.token))];

  return tokens.map((token) => ({
    to: token,
    title: input.groupName,
    body,
    data: { sessionId: input.sessionId },
    sound: "default",
    channelId: "default",
    priority: "high",
  }));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Jetons qu'Expo déclare morts (app désinstallée, données effacées) : à supprimer, sinon
// on les relancerait à chaque vote. Les autres erreurs (quota, réseau) sont passagères.
export function tokensToForget(messages: ExpoMessage[], tickets: ExpoTicket[]): string[] {
  return tickets.flatMap((ticket, index) =>
    ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" && messages[index]
      ? [messages[index].to]
      : [],
  );
}
