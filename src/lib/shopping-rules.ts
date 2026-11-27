// Règles pures de la liste de courses, sans Supabase ni React Native : testées avec node --test.

// Mêmes limites que les colonnes de shopping_items.
export const SHOPPING_LABEL_MAX_LENGTH = 80;
export const SHOPPING_QUANTITY_MAX_LENGTH = 20;

export type ShoppingItem = {
  id: string;
  label: string;
  // Texte libre (« 2 », « 500 g »), ou null.
  quantity: string | null;
  addedBy: string | null;
  // Coché = « je l'ai pris ». Heure et auteur posés par le serveur.
  checkedAt: string | null;
  checkedBy: string | null;
  createdAt: string;
  // Le rayon (deviné à l'ajout, changé par le foyer) et l'étoile « indispensable ».
  aisle: ShoppingAisle;
  isImportant: boolean;
};

// Ordre d'ajout ; deux articles ajoutés d'un coup (même instant, depuis une recette) gardent
// toujours le même ordre entre eux : sans ça, cocher l'un pouvait faire sauter l'autre.
function byAddedOrder(a: ShoppingItem, b: ShoppingItem): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

// Ce qui reste à acheter d'abord, dans l'ordre d'ajout (on remplit la liste au fil de la
// semaine) ; puis ce qui est déjà pris, le dernier pris en tête (on voit ce qui vient
// d'être mis dans le caddie).
export function sortShoppingList(items: ShoppingItem[]): ShoppingItem[] {
  const toBuy = items.filter((item) => item.checkedAt === null).sort(byAddedOrder);
  const taken = items
    .filter((item) => item.checkedAt !== null)
    .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""));
  return [...toBuy, ...taken];
}

export type ShoppingSection = "toBuy" | "taken";

// Les deux sections affichées. Un article qu'on vient de cocher (ou décocher) reste un instant
// dans sa section d'avant (held), à sa place : on peut cocher le suivant sans que la liste
// bouge sous le doigt, puis tout glisse ensemble. Même ordre que sortShoppingList.
export function splitShoppingList(
  items: ShoppingItem[],
  held: ReadonlyMap<string, ShoppingSection>,
): Record<ShoppingSection, ShoppingItem[]> {
  const sectionOf = (item: ShoppingItem): ShoppingSection =>
    held.get(item.id) ?? (item.checkedAt === null ? "toBuy" : "taken");
  return {
    toBuy: items.filter((item) => sectionOf(item) === "toBuy").sort(byAddedOrder),
    // Un article décoché retenu ici n'a plus d'heure : il reste en bas de la section.
    taken: items
      .filter((item) => sectionOf(item) === "taken")
      .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "")),
  };
}

// Texte saisi → valeurs à enregistrer : espaces superflus retirés, quantité vide = null.
export function cleanShoppingInput(
  label: string,
  quantity: string,
): { label: string; quantity: string | null } {
  const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
  const cleanQuantity = tidy(quantity);
  return { label: tidy(label), quantity: cleanQuantity === "" ? null : cleanQuantity };
}

// « Lait », « lait » et « LAIT  » sont le même article ; « Œufs » et « oeufs » aussi.
export function normalizeLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

// L'article déjà dans la liste (à acheter ou déjà pris) qui porte ce nom, s'il y en a un.
// exceptId : l'article qu'on est en train de renommer, qui ne compte pas comme doublon.
export function findDuplicate(
  items: ShoppingItem[],
  label: string,
  exceptId: string | null = null,
): ShoppingItem | null {
  const wanted = normalizeLabel(label);
  return (
    items.find((item) => item.id !== exceptId && normalizeLabel(item.label) === wanted) ?? null
  );
}

// Un article rangé par « Retirer les achetés » : la matière des suggestions.
export type ShoppingHistoryEntry = { label: string; quantity: string | null; clearedAt: string };

export type ShoppingSuggestion = { label: string; quantity: string | null };

// Ce qu'on achète souvent, à rajouter en un toucher : les articles rangés, regroupés par nom
// (majuscules et accents ignorés), les plus fréquents d'abord puis les plus récents, avec la
// dernière quantité utilisée. Ce qui est déjà dans la liste n'est pas proposé.
export function buildSuggestions(
  history: ShoppingHistoryEntry[],
  currentItems: ShoppingItem[],
  max = 8,
): ShoppingSuggestion[] {
  const inList = new Set(currentItems.map((item) => normalizeLabel(item.label)));
  const byName = new Map<
    string,
    { label: string; quantity: string | null; lastAt: string; count: number }
  >();

  for (const entry of history) {
    const key = normalizeLabel(entry.label);
    if (inList.has(key)) continue;
    const known = byName.get(key);
    if (!known) {
      byName.set(key, { ...entry, lastAt: entry.clearedAt, count: 1 });
      continue;
    }
    known.count += 1;
    // Le nom et la quantité de la dernière fois.
    if (entry.clearedAt > known.lastAt) {
      known.label = entry.label;
      known.quantity = entry.quantity;
      known.lastAt = entry.clearedAt;
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
    .slice(0, max)
    .map(({ label, quantity }) => ({ label, quantity }));
}

// « 19 h 40 », l'heure de fin d'un passage aux courses (heure du téléphone).
export function clockLabel(instant: Date): string {
  const minutes = String(instant.getMinutes()).padStart(2, "0");
  return `${instant.getHours()} h ${minutes}`;
}

// Le passage à montrer sur la liste : le mien d'abord, sinon celui d'un autre (le plus récent).
export function tripToShow<T extends { shopperId: string }>(
  trips: T[],
  userId: string | undefined,
): { trip: T; isMine: boolean } | null {
  const mine = trips.find((trip) => trip.shopperId === userId);
  if (mine) return { trip: mine, isMine: true };
  return trips[0] ? { trip: trips[0], isMine: false } : null;
}

// ─── ajouter une recette aux courses ─────────────────────

export type ShoppingAddition = { label: string; quantity: string | null };

export type ShoppingPlan = {
  // Les nouveaux articles.
  toInsert: ShoppingAddition[];
  // Déjà pris (cochés) : ils reviennent dans « À acheter », comme un ajout à la main.
  toUncheck: string[];
  // Déjà à acheter : rien à faire, l'écran le dit.
  alreadyToBuy: string[];
};

// Les ingrédients cochés d'une recette → ce qu'il faut faire sur la liste, sans doublon : même
// règle que l'ajout à la main (le nom, sans accents ni majuscules). Deux lignes de la recette
// au même nom n'en font qu'une.
export function planShoppingAdditions(
  additions: ShoppingAddition[],
  items: ShoppingItem[],
): ShoppingPlan {
  const plan: ShoppingPlan = { toInsert: [], toUncheck: [], alreadyToBuy: [] };
  const seen = new Set<string>();
  for (const addition of additions) {
    const { label, quantity } = cleanShoppingInput(addition.label, addition.quantity ?? "");
    const key = normalizeLabel(label);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    const existing = findDuplicate(items, label);
    if (!existing)
      plan.toInsert.push({
        label: label.slice(0, SHOPPING_LABEL_MAX_LENGTH),
        quantity: quantity?.slice(0, SHOPPING_QUANTITY_MAX_LENGTH) ?? null,
      });
    else if (existing.checkedAt !== null) plan.toUncheck.push(existing.id);
    else plan.alreadyToBuy.push(existing.label);
  }
  return plan;
}

// ─── rayons (2026-11-27, maquette https://claude.ai/artifact/3PSCG8xwP2TxWtpr9VSQ9a) ──

export type ShoppingAisle =
  | "fruits_legumes"
  | "boucherie_poisson"
  | "cremerie"
  | "boulangerie"
  | "epicerie_salee"
  | "epicerie_sucree"
  | "surgeles"
  | "boissons"
  | "bebe"
  | "animaux"
  | "maison_hygiene"
  | "autres";

// L'ordre par défaut, celui d'un supermarché courant ; « autres » toujours en dernier.
export const SHOPPING_AISLES: ShoppingAisle[] = [
  "fruits_legumes",
  "boulangerie",
  "boucherie_poisson",
  "cremerie",
  "epicerie_salee",
  "epicerie_sucree",
  "surgeles",
  "boissons",
  "bebe",
  "animaux",
  "maison_hygiene",
  "autres",
];

export const AISLE_LABELS: Record<ShoppingAisle, string> = {
  fruits_legumes: "Fruits et légumes",
  boucherie_poisson: "Boucherie et poisson",
  cremerie: "Crèmerie",
  boulangerie: "Boulangerie",
  epicerie_salee: "Épicerie salée",
  epicerie_sucree: "Épicerie sucrée",
  surgeles: "Surgelés",
  boissons: "Boissons",
  bebe: "Bébé",
  animaux: "Animaux",
  maison_hygiene: "Maison et hygiène",
  autres: "Autres",
};

// Des expressions d'abord (« lait de coco » n'est pas de la crèmerie), puis des débuts de mots :
// « tomate » reconnaît « tomates » et « tomates cerises ». Les noms sont comparés normalisés
// (minuscules, sans accents, œ → oe).
const AISLE_PHRASES: [string, ShoppingAisle][] = [
  ["lait de coco", "epicerie_salee"],
  ["creme de coco", "epicerie_salee"],
  ["pomme de terre", "fruits_legumes"],
  ["pommes de terre", "fruits_legumes"],
  ["papier toilette", "maison_hygiene"],
  ["essuie tout", "maison_hygiene"],
  ["sac poubelle", "maison_hygiene"],
  ["sacs poubelle", "maison_hygiene"],
  ["liquide vaisselle", "maison_hygiene"],
  ["jus de citron", "epicerie_salee"],
  ["petits pois", "fruits_legumes"],
  ["pain de mie", "boulangerie"],
  ["creme glacee", "surgeles"],
  ["lait infantile", "bebe"],
  ["lait bebe", "bebe"],
  ["petit pot", "bebe"],
  ["petits pots", "bebe"],
  ["fruits de mer", "boucherie_poisson"],
  ["huile d'olive", "epicerie_salee"],
];

const AISLE_WORDS: [string, ShoppingAisle][] = [
  // Fruits et légumes
  ...[
    "tomate",
    "pomme",
    "poire",
    "banane",
    "citron",
    "orange",
    "clementine",
    "mandarine",
    "raisin",
    "fraise",
    "framboise",
    "myrtille",
    "peche",
    "abricot",
    "cerise",
    "kiwi",
    "ananas",
    "mangue",
    "melon",
    "pasteque",
    "avocat",
    "salade",
    "laitue",
    "roquette",
    "mache",
    "epinard",
    "carotte",
    "oignon",
    "echalote",
    "poireau",
    "courgette",
    "aubergine",
    "poivron",
    "concombre",
    "radis",
    "chou",
    "brocoli",
    "champignon",
    "haricot",
    "patate",
    "potiron",
    "courge",
    "butternut",
    "celeri",
    "fenouil",
    "navet",
    "betterave",
    "persil",
    "coriandre",
    "basilic",
    "menthe",
    "ciboulette",
    "gingembre",
    "legume",
    "fruit",
    "asperge",
    "artichaut",
    "endive",
  ].map((word): [string, ShoppingAisle] => [word, "fruits_legumes"]),
  // Boucherie et poisson
  ...[
    "poulet",
    "dinde",
    "canard",
    "boeuf",
    "veau",
    "porc",
    "agneau",
    "viande",
    "steak",
    "escalope",
    "jambon",
    "lardon",
    "saucisse",
    "chorizo",
    "merguez",
    "bacon",
    "roti",
    "cote",
    "filet",
    "poisson",
    "saumon",
    "cabillaud",
    "thon frais",
    "colin",
    "crevette",
    "moule",
    "lieu",
    "truite",
  ].map((word): [string, ShoppingAisle] => [word, "boucherie_poisson"]),
  // Crèmerie
  ...[
    "lait",
    "oeuf",
    "beurre",
    "fromage",
    "yaourt",
    "yogourt",
    "creme",
    "parmesan",
    "emmental",
    "gruyere",
    "comte",
    "mozzarella",
    "feta",
    "chevre",
    "camembert",
    "brie",
    "raclette",
    "mascarpone",
    "ricotta",
    "skyr",
    "faisselle",
    "margarine",
  ].map((word): [string, ShoppingAisle] => [word, "cremerie"]),
  // Boulangerie
  ...["pain", "baguette", "brioche", "croissant", "viennoiserie", "tortilla", "wrap"].map(
    (word): [string, ShoppingAisle] => [word, "boulangerie"],
  ),
  // Épicerie salée
  ...[
    "pate",
    "spaghetti",
    "tagliatelle",
    "lasagne",
    "riz",
    "semoule",
    "quinoa",
    "boulgour",
    "farine",
    "huile",
    "vinaigre",
    "sel",
    "poivre",
    "epice",
    "moutarde",
    "mayonnaise",
    "ketchup",
    "sauce",
    "bouillon",
    "conserve",
    "lentille",
    "pois chiche",
    "thon",
    "sardine",
    "olive",
    "cornichon",
    "chips",
    "cracker",
    "soupe",
    "levure",
    "chapelure",
    "curry",
    "paprika",
    "cumin",
  ].map((word): [string, ShoppingAisle] => [word, "epicerie_salee"]),
  // Épicerie sucrée
  ...[
    "sucre",
    "chocolat",
    "cafe",
    "the",
    "tisane",
    "biscuit",
    "gateau",
    "confiture",
    "miel",
    "cereale",
    "muesli",
    "compote",
    "pate a tartiner",
    "nutella",
    "bonbon",
    "caramel",
    "vanille",
  ].map((word): [string, ShoppingAisle] => [word, "epicerie_sucree"]),
  // Surgelés
  ...["surgele", "glace", "frite", "nugget", "pizza surgelee", "esquimau", "sorbet"].map(
    (word): [string, ShoppingAisle] => [word, "surgeles"],
  ),
  // Boissons
  ...["eau", "jus", "vin", "biere", "soda", "coca", "limonade", "sirop", "cidre", "champagne"].map(
    (word): [string, ShoppingAisle] => [word, "boissons"],
  ),
  // Bébé
  ...["couche", "lingette", "biberon", "tetine", "bebe"].map((word): [string, ShoppingAisle] => [
    word,
    "bebe",
  ]),
  // Animaux
  ...["croquette", "patee", "litiere", "chat", "chien", "friandise"].map(
    (word): [string, ShoppingAisle] => [word, "animaux"],
  ),
  // Maison et hygiène
  ...[
    "eponge",
    "papier",
    "lessive",
    "adoucissant",
    "savon",
    "gel douche",
    "shampo",
    "dentifrice",
    "brosse",
    "deodorant",
    "mouchoir",
    "coton",
    "rasoir",
    "serviette",
    "aluminium",
    "film",
    "poubelle",
    "javel",
    "nettoyant",
    "pile",
    "ampoule",
    "bougie",
  ].map((word): [string, ShoppingAisle] => [word, "maison_hygiene"]),
];

// Le rayon d'un article : d'abord celui choisi par le foyer pour ce nom, sinon deviné d'après
// le nom, sinon « autres » (le foyer le range, et l'app s'en souviendra).
export function guessAisle(
  label: string,
  chosen: ReadonlyMap<string, ShoppingAisle> = new Map(),
): ShoppingAisle {
  const key = normalizeLabel(label);
  const remembered = chosen.get(key);
  if (remembered) return remembered;

  const phrase = AISLE_PHRASES.find(([text]) => key.includes(text));
  if (phrase) return phrase[1];

  // Les mots-clés de plusieurs mots d'abord (« pate a tartiner » avant « pate ») ; un mot seul
  // au début d'un mot du nom (« tomate » dans « tomates ») ; trois lettres ou moins, en entier
  // (« eau » ne doit pas reconnaître « gateau »).
  const multi = AISLE_WORDS.find(([keyword]) => keyword.includes(" ") && key.includes(keyword));
  if (multi) return multi[1];
  const words = key.split(/[\s'-]+/);
  const match = AISLE_WORDS.find(
    ([keyword]) =>
      !keyword.includes(" ") &&
      words.some((word) =>
        keyword.length <= 3 ? word === keyword || word === `${keyword}s` : word.startsWith(keyword),
      ),
  );
  return match ? match[1] : "autres";
}

// L'ordre des rayons du foyer, complété : un rayon ajouté depuis va avant « autres », qui reste
// en dernier. Sans ordre enregistré, l'ordre par défaut.
export function orderedAisles(saved: readonly ShoppingAisle[] | null): ShoppingAisle[] {
  if (!saved) return SHOPPING_AISLES;
  const known = saved.filter(
    (aisle, index) => SHOPPING_AISLES.includes(aisle) && saved.indexOf(aisle) === index,
  );
  const missing = SHOPPING_AISLES.filter((aisle) => !known.includes(aisle));
  const withoutOthers: ShoppingAisle[] = [...known, ...missing].filter(
    (aisle) => aisle !== "autres",
  );
  return [...withoutOthers, "autres"];
}

// Monter ou descendre un rayon d'un cran ; « autres » ne bouge pas et reste en dernier.
export function moveAisle(
  order: readonly ShoppingAisle[],
  aisle: ShoppingAisle,
  delta: -1 | 1,
): ShoppingAisle[] {
  const from = order.indexOf(aisle);
  const to = from + delta;
  const last = order.length - 1;
  if (aisle === "autres" || from < 0 || to < 0 || to >= last) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// Les sections de « À acheter » : les indispensables en tête, puis un rayon par section dans
// l'ordre du foyer (sections vides retirées), ou tout ensemble pour le tri par ajout.
export type ShoppingSectionGroup<T> = {
  key: "important" | "all" | ShoppingAisle;
  items: T[];
};

export function groupShoppingItems<T extends { aisle: ShoppingAisle; isImportant: boolean }>(
  items: T[],
  order: readonly ShoppingAisle[],
  mode: "aisle" | "added",
): ShoppingSectionGroup<T>[] {
  const important = items.filter((item) => item.isImportant);
  const rest = items.filter((item) => !item.isImportant);
  const groups: ShoppingSectionGroup<T>[] =
    important.length > 0 ? [{ key: "important", items: important }] : [];
  if (mode === "added") {
    return rest.length > 0 ? [...groups, { key: "all", items: rest }] : groups;
  }
  for (const aisle of order) {
    const inAisle = rest.filter((item) => item.aisle === aisle);
    if (inAisle.length > 0) groups.push({ key: aisle, items: inAisle });
  }
  return groups;
}
