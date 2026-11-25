// Données d'une notification touchée → l'écran à ouvrir : un vote (notify-vote), un repas
// (notify-meal) ou une liste de courses (notify-shopping). Elles viennent de l'extérieur de l'app : on ne navigue que vers
// un identifiant bien formé, jamais vers une adresse fournie telle quelle.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NotificationTarget =
  | { kind: "session"; id: string }
  | { kind: "soiree"; id: string }
  | { kind: "courses"; id: string };

function uuidField(data: unknown, field: string): string | null {
  if (typeof data !== "object" || data === null) return null;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function notificationTarget(data: unknown): NotificationTarget | null {
  const sessionId = uuidField(data, "sessionId");
  if (sessionId) return { kind: "session", id: sessionId };
  const soireeId = uuidField(data, "soireeId");
  if (soireeId) return { kind: "soiree", id: soireeId };
  const coursesGroupId = uuidField(data, "coursesGroupId");
  if (coursesGroupId) return { kind: "courses", id: coursesGroupId };
  return null;
}
