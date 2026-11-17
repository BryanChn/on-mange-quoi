// Données d'une notification touchée → identifiant du vote à ouvrir.
// Elles viennent de l'extérieur de l'app : on ne navigue que vers un identifiant bien formé,
// jamais vers une adresse fournie telle quelle.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sessionIdFromNotification(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { sessionId } = data as Record<string, unknown>;
  return typeof sessionId === "string" && UUID.test(sessionId) ? sessionId : null;
}
