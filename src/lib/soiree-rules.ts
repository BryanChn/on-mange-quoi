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
  const full = name === "" ? `Repas de ${day.toLowerCase()}` : `${day} chez ${name}`;
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
    message: "Il a peut-être été mal copié, ou le repas a été supprimé. Demande un nouveau lien.",
  },
  soiree_closed: {
    title: "Trop tard, c’est commandé",
    message: "La commande est partie : on ne peut plus rejoindre ce repas.",
  },
  soiree_full: {
    title: "Le repas est complet",
    message: `Déjà ${SOIREE_MAX_MEMBERS} personnes, c’est le maximum. Demande à la personne qui organise de faire de la place.`,
  },
  name_required: {
    title: "Choisis un pseudo",
    message: "C’est le nom que les autres verront.",
  },
};

// ─── récapitulatif de la commande ────────────────────────

export type OrderLine = {
  profileId: string;
  label: string;
  quantity: number;
  note: string | null;
};

// Une ligne du récapitulatif pour le comptoir : « 3× Kebab sauce blanche », et qui l'a pris.
export type OrderSummaryLine = {
  label: string;
  note: string | null;
  quantity: number;
  // « Tom », ou « Tom (2) » s'il en a pris plusieurs, dans l'ordre d'arrivée des lignes.
  people: string[];
};

// « Kebab  Sauce blanche » et « kebab sauce blanche » sont le même article.
function normalize(text: string | null): string {
  return (text ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// Regroupe les lignes identiques (même article, même remarque) et additionne les quantités.
// Une remarque différente fait une ligne à part : sinon le « sans oignon » se perd au comptoir.
// Les plus demandés d'abord, puis par ordre alphabétique.
export function summarizeOrder(
  items: OrderLine[],
  nameOf: (profileId: string) => string,
): OrderSummaryLine[] {
  const groups = new Map<
    string,
    { label: string; note: string | null; quantity: number; byPerson: Map<string, number> }
  >();

  for (const item of items) {
    const key = `${normalize(item.label)}\u0000${normalize(item.note)}`;
    const group = groups.get(key) ?? {
      label: tidy(item.label),
      note: item.note && item.note.trim() !== "" ? tidy(item.note) : null,
      quantity: 0,
      byPerson: new Map<string, number>(),
    };
    group.quantity += item.quantity;
    group.byPerson.set(item.profileId, (group.byPerson.get(item.profileId) ?? 0) + item.quantity);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      label: group.label,
      note: group.note,
      quantity: group.quantity,
      people: [...group.byPerson].map(([profileId, quantity]) =>
        quantity > 1 ? `${nameOf(profileId)} (${quantity})` : nameOf(profileId),
      ),
    }))
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, "fr"));
}

// « Qui prend quoi » : ce que chacun a pris, pour que chacun vérifie sa commande d'un coup d'œil.
export type RecapPerson = {
  name: string;
  // « Kebab sauce blanche, 2× Frites (sans sel) »
  items: string;
};

// Une ligne par personne, dans l'ordre de sa première ligne de commande. Ses lignes identiques
// (même article, même remarque) s'additionnent, comme au comptoir.
export function recapPeople(
  items: OrderLine[],
  nameOf: (profileId: string) => string,
): RecapPerson[] {
  const byPerson = new Map<
    string,
    Map<string, { label: string; note: string | null; quantity: number }>
  >();

  for (const item of items) {
    const lines = byPerson.get(item.profileId) ?? new Map();
    const key = `${normalize(item.label)}\u0000${normalize(item.note)}`;
    const line = lines.get(key) ?? {
      label: tidy(item.label),
      note: item.note && item.note.trim() !== "" ? tidy(item.note) : null,
      quantity: 0,
    };
    line.quantity += item.quantity;
    lines.set(key, line);
    byPerson.set(item.profileId, lines);
  }

  return [...byPerson].map(([profileId, lines]) => ({
    name: nameOf(profileId),
    items: [...lines.values()]
      .map(
        (line) =>
          `${line.quantity > 1 ? `${line.quantity}× ` : ""}${line.label}${line.note ? ` (${line.note})` : ""}`,
      )
      .join(", "),
  }));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

export type OrderTextInput = {
  restaurant: string | null;
  isOrdered: boolean;
  // Avec les vrais prénoms, jamais « toi » : le texte est lu par les autres.
  lines: OrderSummaryLine[];
  people: RecapPerson[];
  waiting: string[];
  // Lien de la soirée : ajouté seulement si la commande est ouverte et que des gens attendent.
  joinUrl: string | null;
};

// Le récapitulatif en texte, pour WhatsApp (*gras*, _italique_) ou à lire au comptoir.
// « Pour le comptoir » sans les noms (on le lit au caissier), puis « Qui prend quoi ».
export function orderText({
  restaurant,
  isOrdered,
  lines,
  people,
  waiting,
  joinUrl,
}: OrderTextInput): string {
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  const state = isOrdered ? "commande passée ✅" : "commande ouverte";
  const headcount =
    !isOrdered && waiting.length > 0
      ? `${plural(people.length, "personne")} sur ${people.length + waiting.length}`
      : plural(people.length, "personne");

  const blocks = [
    [`*${restaurant ?? "Commande"}* · ${state}`, `${plural(total, "article")} · ${headcount}`],
    [
      "*Pour le comptoir*",
      ...lines.map(
        (line) => `${line.quantity}× ${line.label}${line.note ? ` _(${line.note})_` : ""}`,
      ),
    ],
    ["*Qui prend quoi*", ...people.map((person) => `${person.name} : ${person.items}`)],
  ];

  if (!isOrdered && waiting.length > 0) {
    blocks.push([
      `Pas encore commandé : ${waiting.join(", ")}`,
      ...(joinUrl ? [`Pour commander : ${joinUrl}`] : []),
    ]);
  }
  blocks.push(["Organisé avec On mange quoi ?"]);

  return blocks.map((block) => block.join("\n")).join("\n\n");
}

// Qui n'a encore rien commandé (dans l'ordre d'arrivée dans la soirée).
export function namesWithoutOrder(
  members: { id: string; name: string }[],
  items: OrderLine[],
): string[] {
  const ordered = new Set(items.map((item) => item.profileId));
  return members.filter((member) => !ordered.has(member.id)).map((member) => member.name);
}
