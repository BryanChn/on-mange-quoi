// Logique pure de notify-vote : quel corps accepter, qui prévenir et avec quel texte.
// Testée avec node --test (messages.test.ts). Le reste de l'API Expo est dans _shared.

import type { ExpoMessage } from "../_shared/expo-push.ts";
import type { NotificationCategory } from "../_shared/notification-category.ts";

// reminder : le rappel unique (send_vote_reminders, pg_cron), 1 h après le lancement.
export type VoteEvent = "opened" | "closed" | "reminder";

export type NotifyRequest = { sessionId: string; event: VoteEvent };

// Un téléphone à prévenir : le jeton et le membre à qui il appartient.
export type Recipient = { profileId: string; token: string };

// Ce que décide un vote (enum vote_topic) et le type d'un repas (enum soiree_mode).
// Copiés de la base : une Edge Function ne peut pas importer le code de l'app.
export type VoteTopic = "plat" | "resto" | "apero" | "entree" | "dessert";
export type MealMode = "commande" | "resto" | "maison";

// Un vote d'un repas « maison », relu au moment de l'envoi.
export type MenuVote = {
  id: string;
  topic: VoteTopic;
  status: "open" | "closed";
  closedAt: string | null;
  winnerName: string | null;
};

// Un plat décidé du menu : « Dessert : Tiramisu ».
export type MenuDish = { topic: VoteTopic; winnerName: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dans l'ordre d'un repas, comme l'enum vote_topic.
const TOPIC_ORDER: VoteTopic[] = ["apero", "entree", "plat", "dessert", "resto"];

// « Bryan lance le vote : quel dessert ? »
const QUESTION: Record<VoteTopic, string> = {
  plat: "on mange quoi ?",
  resto: "où on mange ?",
  apero: "quel apéro ?",
  entree: "quelle entrée ?",
  dessert: "quel dessert ?",
};

const LABEL: Record<VoteTopic, string> = {
  plat: "Plat",
  resto: "Resto",
  apero: "Apéro",
  entree: "Entrée",
  dessert: "Dessert",
};

// Quel interrupteur de Mon compte (table notification_settings) s'applique : les votes d'un
// foyer, ou tout ce qui concerne un repas à plusieurs.
export function notificationCategory(mealMode: MealMode | null): NotificationCategory {
  return mealMode === null ? "votes" : "meals";
}

// Le corps vient du trigger, mais l'URL de la fonction est publique : on valide tout.
export function parseNotifyRequest(body: unknown): NotifyRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { session_id: sessionId, event } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) return null;
  if (event !== "opened" && event !== "closed" && event !== "reminder") return null;
  return { sessionId, event };
}

// Repas « maison » : le menu est décidé quand plus aucun vote n'est ouvert. Seul le dernier
// vote terminé annonce le menu, les autres se taisent (une notification par sujet serait du
// bruit). Deux votes terminés au même instant appellent la fonction deux fois, et les deux
// appels relisent la même base : ils désignent le même dernier vote, un seul envoie.
// null : ce vote n'est pas le dernier, rien à annoncer.
export function menuIfLast(votes: MenuVote[], sessionId: string): MenuDish[] | null {
  if (votes.some((vote) => vote.status === "open")) return null;

  const last = [...votes].sort(
    (a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? "") || a.id.localeCompare(b.id),
  ).at(-1);
  if (last?.id !== sessionId) return null;

  return votes
    .filter((vote): vote is MenuVote & { winnerName: string } => vote.winnerName !== null)
    .sort((a, b) => TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic))
    .map((vote) => ({ topic: vote.topic, winnerName: vote.winnerName }));
}

type MessageInput = {
  event: VoteEvent;
  sessionId: string;
  groupName: string;
  // null pour un foyer.
  mealMode: MealMode | null;
  topic: VoteTopic;
  // Midi ou soir pour un foyer (migration vote_moment) ; null pour un repas.
  moment: "midi" | "soir" | null;
  organizerId: string | null;
  organizerName: string | null;
  winnerName: string | null;
  // Repas « maison », fin d'un vote : le menu complet (menuIfLast), ou null tant qu'un
  // autre vote du menu reste à terminer.
  menu: MenuDish[] | null;
  recipients: Recipient[];
  // Membres qui ont déjà proposé un plat ou voté (lu seulement pour le rappel).
  participantIds: string[];
};

function recipientsFor(input: MessageInput): Recipient[] {
  if (input.event === "closed") {
    // Le menu n'est pas encore complet : personne à prévenir.
    if (input.mealMode === "maison" && input.menu === null) return [];
    return input.recipients;
  }
  if (input.event === "opened") {
    return input.recipients.filter((recipient) => recipient.profileId !== input.organizerId);
  }
  // Rappel : seulement ceux qui n'ont rien fait. L'organisateur a lancé le vote, il est au
  // courant ; un membre qui a proposé ou voté n'a pas besoin d'être relancé.
  const participants = new Set(input.participantIds);
  return input.recipients.filter(
    (recipient) =>
      recipient.profileId !== input.organizerId && !participants.has(recipient.profileId),
  );
}

// « on va chez Momo », mais « on va Chez Momo » (même règle que goingTo dans l'app).
function goingTo(restaurant: string): string {
  const name = restaurant.trim();
  return /^chez\s/i.test(name) ? `on va ${name}` : `on va chez ${name}`;
}

const NO_WINNER = "Le vote est terminé : viens voir le résultat.";

function closedBody(input: MessageInput): string {
  if (input.mealMode === "maison") {
    const dishes = input.menu ?? [];
    if (dishes.length === 0) return NO_WINNER;
    const lines = dishes.map((dish) => `${LABEL[dish.topic]} : ${dish.winnerName}.`);
    return `Le menu est décidé. ${lines.join(" ")}`;
  }
  if (!input.winnerName) return NO_WINNER;
  // Commande : le resto est choisi, la suite est d'écrire sa commande.
  if (input.mealMode === "commande") return `C'est décidé : ${input.winnerName}. Écris ta commande.`;
  if (input.mealMode === "resto") return `C'est décidé : ${goingTo(input.winnerName)}.`;
  return `C'est décidé : ${input.winnerName}. Bon appétit !`;
}

function bodyFor(input: MessageInput): string {
  if (input.event === "opened") {
    // Un foyer dit pour quel repas (« on mange quoi ce midi ? »), un repas a sa date.
    const question =
      input.topic === "plat" && input.moment
        ? `on mange quoi ${input.moment === "midi" ? "ce midi" : "ce soir"} ?`
        : QUESTION[input.topic];
    return `${input.organizerName ?? "Quelqu'un"} lance le vote : ${question}`;
  }
  if (input.event === "reminder") {
    // Un repas « maison » n'a qu'un rappel pour tous ses votes : il parle du menu.
    if (input.mealMode === "maison") return "Le menu t'attend : propose ou coche ce qui te tente.";
    const dish = input.topic === "resto" ? "un resto" : "un plat";
    return `Le vote t'attend : propose ${dish} ou coche ce qui te tente.`;
  }
  return closedBody(input);
}

// Lancement : les autres membres (l'organisateur sait qu'il vient de lancer le vote).
// Résultat : tout le groupe, organisateur compris (il n'est peut-être plus sur l'écran) ;
// pour un repas « maison », une seule fois, quand tout le menu est décidé.
// Rappel : les membres qui n'ont ni proposé ni voté.
export function buildMessages(input: MessageInput): ExpoMessage[] {
  const recipients = recipientsFor(input);
  const body = bodyFor(input);

  // Un même jeton ne doit sonner qu'une fois, même s'il apparaît deux fois.
  const tokens = [...new Set(recipients.map((recipient) => recipient.token))];

  return tokens.map((token) => ({
    to: token,
    title: input.groupName,
    body,
    // Lu par l'app (notification-link.ts) pour ouvrir le vote au toucher. Le vote d'un repas
    // a un bouton « Retour au repas ».
    data: { sessionId: input.sessionId },
    sound: "default",
    channelId: "default",
    priority: "high",
  }));
}
