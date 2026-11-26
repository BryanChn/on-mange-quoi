// Erreurs réseau, sans Supabase ni React Native : testées avec node --test.
// Une coupure courte (passage de la 5G au Wi-Fi, ascenseur) ne doit pas bloquer l'app ; un
// réseau qui filtre le serveur (Wi-Fi d'entreprise) doit être dit tel quel, pas « vérifie ta
// connexion » quand Internet marche.

export type ErrorKind =
  // La requête n'est jamais arrivée : pas de réseau, ou un réseau qui bloque le serveur.
  | "unreachable"
  // Le serveur a répondu « session expirée ou invalide » : se reconnecter.
  | "session"
  // Le serveur a répondu, en panne (5xx) ou trop lent.
  | "server"
  | "other";

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "object" && error !== null) {
    const { name, message, code } = error as { name?: unknown; message?: unknown; code?: unknown };
    return [name, message, code].filter((part) => typeof part === "string").join(" ");
  }
  return String(error);
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

// Les formes que prennent ces erreurs chez supabase-js : fetch qui échoue (« Network request
// failed » sur le téléphone, « Failed to fetch » sur le web, « fetch failed » sous node),
// AuthRetryableFetchError (statut 0), PGRST301 / « JWT expired », statuts HTTP.
export function classifyError(error: unknown): ErrorKind {
  const text = textOf(error);
  const status = statusOf(error);
  if (/PGRST30\d|jwt|refresh token|invalid claim|not authenticated/i.test(text) || status === 401) {
    return "session";
  }
  if (
    /network request failed|failed to fetch|fetch failed|network ?error|AuthRetryableFetchError|load failed|ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(
      text,
    ) ||
    status === 0
  ) {
    return "unreachable";
  }
  if ((status !== null && status >= 500) || /timeout|timed out|upstream|gateway/i.test(text)) {
    return "server";
  }
  return "other";
}

// Réessayer n'a de sens que si la cause peut passer d'elle-même.
export function isRetryable(error: unknown): boolean {
  const kind = classifyError(error);
  return kind === "unreachable" || kind === "server";
}

// Les délais entre deux essais : 1 s, 2 s, 4 s (« exponential backoff »). Le réseau a le temps
// de revenir, sans bombarder le serveur.
export const RETRY_DELAYS_MS = [1000, 2000, 4000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Lance `task`, et la relance après chaque délai tant que l'échec est passager. Lève la
// dernière erreur si tout échoue. `sleep` est remplaçable pour les tests.
export async function withRetry<T>(
  task: () => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= delays.length || !isRetryable(error)) throw error;
      await sleep(delays[attempt]);
    }
  }
}

// Ce qu'on dit à la personne, selon la cause.
export function errorMessage(kind: ErrorKind): string {
  switch (kind) {
    case "unreachable":
      return "Le serveur ne répond pas sur ce réseau. Un Wi-Fi d’entreprise ou public le bloque parfois : essaie en données mobiles.";
    case "session":
      return "Ta session a expiré. Déconnecte-toi, puis reconnecte-toi avec ton e-mail.";
    case "server":
      return "Le serveur ne répond pas pour l’instant. Réessaie dans un moment.";
    case "other":
      return "Quelque chose s’est mal passé. Réessaie ; si ça continue, déconnecte-toi puis reconnecte-toi.";
  }
}
