// Logique pure autour de l'API push d'Expo, partagée par notify-vote et push-receipts.
// Aucune dépendance à Deno ni au réseau : testée avec node --test (expo-push.test.ts).
// Extensions .ts explicites : Deno et Node les exigent tous les deux.
//
// Expo répond en deux temps : un **ticket** tout de suite (message accepté ou non), puis un
// **reçu** une fois le message remis à FCM (environ 15 min plus tard, gardé 24 h). Un jeton
// mort peut n'apparaître que dans le reçu : d'où la table push_tickets et push-receipts.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// Limites d'Expo : 100 messages par envoi ; 300 identifiants par demande de reçus (valeur
// retenue par expo-server-sdk).
export const EXPO_SEND_BATCH_SIZE = 100;
export const EXPO_RECEIPTS_BATCH_SIZE = 300;

// Un message = un téléphone.
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  channelId: "default";
  priority: "high";
};

type ExpoError = { status: "error"; message: string; details?: { error?: string } };

// Réponse immédiate d'Expo pour un message, dans le même ordre que l'envoi.
export type ExpoTicket = { status: "ok"; id: string } | ExpoError;

// Réponse différée, indexée par identifiant de ticket.
export type ExpoReceipt = { status: "ok" } | ExpoError;

// Ticket à suivre : on garde le jeton pour pouvoir le supprimer si le reçu le déclare mort.
export type TrackedTicket = { id: string; token: string };

const isDeadDevice = (response: ExpoTicket | ExpoReceipt): boolean =>
  response.status === "error" && response.details?.error === "DeviceNotRegistered";

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

// Jetons qu'Expo déclare morts dès le ticket (app désinstallée, données effacées).
// Les autres erreurs (quota, réseau) sont passagères : on ne supprime rien.
export function tokensToForget(messages: ExpoMessage[], tickets: ExpoTicket[]): string[] {
  return tickets.flatMap((ticket, index) =>
    isDeadDevice(ticket) && messages[index] ? [messages[index].to] : [],
  );
}

// Tickets acceptés : leur reçu dira plus tard si le téléphone a vraiment été atteint.
export function ticketsToTrack(messages: ExpoMessage[], tickets: ExpoTicket[]): TrackedTicket[] {
  return tickets.flatMap((ticket, index) =>
    ticket.status === "ok" && messages[index] ? [{ id: ticket.id, token: messages[index].to }] : [],
  );
}

// Ce que les reçus permettent de conclure :
// - forget : jetons déclarés morts, à supprimer ;
// - settled : tickets dont le reçu est arrivé (ok ou erreur), à ne plus suivre.
// Un ticket sans reçu n'est pas encore traité par Expo : on le garde pour le prochain passage.
export function readReceipts(
  tracked: TrackedTicket[],
  receipts: Record<string, ExpoReceipt>,
): { forget: string[]; settled: string[] } {
  const forget = new Set<string>();
  const settled: string[] = [];
  for (const ticket of tracked) {
    const receipt = receipts[ticket.id];
    if (!receipt) continue;
    settled.push(ticket.id);
    if (isDeadDevice(receipt)) forget.add(ticket.token);
  }
  return { forget: [...forget], settled };
}
