// Règles pures des soirées, sans Supabase ni React Native : testées avec node --test.

// Même limite que la colonne groups.name.
export const SOIREE_NAME_MAX_LENGTH = 50;

// 20 personnes au plus (join_soiree).
export const SOIREE_MAX_MEMBERS = 20;

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Nom proposé à la création : « Samedi chez Bryan ». Le jour d'aujourd'hui (on organise
// souvent le jour même), modifiable avant de créer. Coupé à la limite de la colonne.
export function defaultSoireeName(now: Date, firstName: string): string {
  const name = firstName.trim();
  const day = WEEKDAYS[now.getDay()];
  const full = name === "" ? `Soirée de ${day.toLowerCase()}` : `${day} chez ${name}`;
  return full.slice(0, SOIREE_NAME_MAX_LENGTH);
}

// Pourquoi rejoindre a échoué, d'après la clé stable (hint) que renvoie join_soiree.
export type JoinFailure = "invalid_link" | "soiree_closed" | "soiree_full" | "name_required";

const JOIN_FAILURES: readonly JoinFailure[] = [
  "invalid_link",
  "soiree_closed",
  "soiree_full",
  "name_required",
];

// null : une autre erreur (réseau, serveur), à présenter comme telle.
export function toJoinFailure(error: unknown): JoinFailure | null {
  if (typeof error !== "object" || error === null || !("hint" in error)) return null;
  const { hint } = error;
  return JOIN_FAILURES.find((failure) => failure === hint) ?? null;
}

export const JOIN_FAILURE_MESSAGES: Record<JoinFailure, { title: string; message: string }> = {
  invalid_link: {
    title: "Ce lien ne marche pas",
    message: "Il a peut-être été mal copié, ou la soirée a été supprimée. Demande un nouveau lien.",
  },
  soiree_closed: {
    title: "La commande est déjà passée",
    message: "Cette soirée est terminée : on ne peut plus la rejoindre.",
  },
  soiree_full: {
    title: "La soirée est complète",
    message: `Elle compte déjà ${SOIREE_MAX_MEMBERS} personnes, le maximum.`,
  },
  name_required: {
    title: "Choisis un pseudo",
    message: "C'est le nom que les autres verront.",
  },
};
