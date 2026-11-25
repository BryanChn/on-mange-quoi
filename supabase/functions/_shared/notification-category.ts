// Quel interrupteur de Mon compte (table notification_settings) s'applique : les votes d'un
// foyer, tout ce qui concerne un repas à plusieurs, ou la liste de courses. Sans Deno :
// importé par la logique pure testée avec node.
export type NotificationCategory = "votes" | "meals" | "shopping";
