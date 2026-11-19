// URL et clés de la base Supabase locale (Docker), lues dans `supabase status`.
// Jamais le projet en ligne : les tests créent et suppriment des comptes.
import { execFileSync } from "node:child_process";

type LocalSupabase = { url: string; anonKey: string; serviceRoleKey: string };

function readLocalSupabase(): LocalSupabase {
  let output: string;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Supabase local injoignable : lancer `npm run db:start` avant ces tests.");
  }

  const status = JSON.parse(output) as Record<string, string>;
  const url = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("`supabase status` ne donne pas l'URL et les clés attendues.");
  }
  // Garde-fou : la clé service_role contourne la RLS, elle ne doit viser que la machine locale.
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Les tests d'intégration refusent une base distante (${hostname}).`);
  }
  return { url, anonKey, serviceRoleKey };
}

export const localSupabase = readLocalSupabase();
