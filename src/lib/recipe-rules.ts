// Règles pures des recettes, sans Supabase ni React Native : testées avec node --test.
// Lire une ligne d'ingrédient, adapter les quantités au nombre de parts, estimer les
// calories et les macros d'une part à partir des aliments Ciqual (valeurs pour 100 g).
import type { Enums } from "./database.types";

export type IngredientUnit = Enums<"ingredient_unit">;

// Mêmes limites que les colonnes de recipe_ingredients.
export const INGREDIENT_RAW_MAX_LENGTH = 120;
export const INGREDIENT_LABEL_MAX_LENGTH = 80;
const QUANTITY_MAX = 100000;

// ─── lire une ligne ──────────────────────────────────────

export type ParsedIngredient = {
  // Le nom de l'ingrédient (« bœuf haché »), sans la quantité ni l'unité.
  label: string;
  // null : pas de quantité chiffrée (« sel », « poivre du moulin »).
  quantity: number | null;
  // null : sans unité (« 2 œufs ») ou sans quantité.
  unit: IngredientUnit | null;
};

// Les façons courantes d'écrire chaque unité, des plus longues aux plus courtes : « c. à s. »
// doit être reconnu avant « cs ». Une unité est un mot entier : « 2 gousses » n'est pas en g,
// « 1 l'oignon » n'est pas en litres.
const SPOON = String.raw`(?:cuill?[eè]res?|cuill?\.?|c\.?)\s*(?:à|a)?\s*`;
const UNIT_PATTERNS: [IngredientUnit, RegExp][] = [
  [
    "cuillere_soupe",
    new RegExp(String.raw`^(?:${SPOON}(?:soupe|s\.?)|c\.?à\.?s\.?|càs|cas|cs)`, "i"),
  ],
  [
    "cuillere_cafe",
    new RegExp(String.raw`^(?:${SPOON}(?:caf[ée]|c\.?)|c\.?à\.?c\.?|càc|cac|cc)`, "i"),
  ],
  ["pincee", /^pinc[ée]es?/i],
  ["kg", /^(?:kilogrammes?|kilos?|kg)/i],
  ["g", /^(?:grammes?|gr\.?|g)/i],
  ["ml", /^(?:millilitres?|ml)/i],
  ["cl", /^(?:centilitres?|cl)/i],
  ["l", /^(?:litres?|l)/i],
];

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
};

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

// La quantité en tête de ligne et ce qui reste après. Formes lues : « 500 », « 1,5 », « 0.5 »,
// « 1/2 », « 1 1/2 », « ½ », « 1½ », « 2 à 3 » et « 2-3 » (le plus grand : mieux vaut en avoir
// assez), « un » / « une » devant un nom (mais pas « un peu »).
function readQuantity(line: string): { quantity: number; rest: string } | null {
  const range = new RegExp(String.raw`^(${NUMBER})\s*(?:-|–|à|a)\s*(${NUMBER})(?![\d/])`, "i").exec(
    line,
  );
  if (range) {
    return {
      quantity: Math.max(toNumber(range[1]), toNumber(range[2])),
      rest: line.slice(range[0].length),
    };
  }
  const mixed = /^(\d+)\s+(\d+)\/(\d+)/.exec(line);
  if (mixed) {
    if (Number(mixed[3]) === 0) return null;
    return {
      quantity: Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]),
      rest: line.slice(mixed[0].length),
    };
  }
  const fraction = /^(\d+)\/(\d+)/.exec(line);
  if (fraction) {
    // « 1/0 » ne se lit pas : la ligne reste en texte libre.
    if (Number(fraction[2]) === 0) return null;
    return {
      quantity: Number(fraction[1]) / Number(fraction[2]),
      rest: line.slice(fraction[0].length),
    };
  }
  const withUnicode = new RegExp(String.raw`^(\d+)?\s*([${FRACTION_CHARS}])`).exec(line);
  if (withUnicode) {
    return {
      quantity: Number(withUnicode[1] ?? 0) + UNICODE_FRACTIONS[withUnicode[2]],
      rest: line.slice(withUnicode[0].length),
    };
  }
  const plain = new RegExp(String.raw`^(${NUMBER})`).exec(line);
  if (plain) {
    return { quantity: toNumber(plain[1]), rest: line.slice(plain[0].length) };
  }
  const article = /^(?:une?)\s+(?!peu\b)/i.exec(line);
  if (article) {
    return { quantity: 1, rest: line.slice(article[0].length) };
  }
  return null;
}

function readUnit(text: string): { unit: IngredientUnit; rest: string } | null {
  for (const [unit, pattern] of UNIT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const rest = text.slice(match[0].length);
    // Un mot entier : suivi d'un espace, d'un point ou de la fin de la ligne.
    if (rest === "" || /^[\s.]/.test(rest)) {
      return { unit, rest: rest.replace(/^\.?\s*/, "") };
    }
  }
  return null;
}

// « 500 g de bœuf haché » → { label: "bœuf haché", quantity: 500, unit: "g" }.
// Ce qui ne se lit pas reste en texte libre : le nom est alors la ligne entière, sans
// quantité. La ligne telle qu'écrite (raw) est gardée à côté, en base.
export function parseIngredientLine(raw: string): ParsedIngredient {
  const line = raw.trim().replace(/\s+/g, " ");
  const freeText: ParsedIngredient = {
    label: line.slice(0, INGREDIENT_LABEL_MAX_LENGTH),
    quantity: null,
    unit: null,
  };

  const read = readQuantity(line);
  if (!read || !(read.quantity > 0) || read.quantity > QUANTITY_MAX) return freeText;

  let rest = read.rest.trimStart();
  let unit: IngredientUnit | null = null;
  const unitRead = readUnit(rest);
  if (unitRead) {
    unit = unitRead.unit;
    // « de », « d' » après une unité : « 200 g d'épinards » → « épinards ».
    rest = unitRead.rest.replace(/^(?:de\s+|d['’]\s*)/i, "");
  }

  const label = rest.trim().slice(0, INGREDIENT_LABEL_MAX_LENGTH);
  // « 1 l » tout seul : rien à acheter de nommé, on garde la ligne en texte libre.
  if (label === "") return freeText;
  // numeric(8, 2) en base.
  return { label, quantity: Math.round(read.quantity * 100) / 100, unit };
}

// ─── adapter aux parts ───────────────────────────────────

export type Amount = { quantity: number; unit: IngredientUnit | null };

// Pour l'écran de la recette, on arrondit à ce qui se mesure ; pour la liste de courses,
// une pièce s'achète entière (1,5 œuf → 2 œufs).
export type AmountPurpose = "recette" | "courses";

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// Arrondi lisible : 333,33 g → 335 g ; 7,3 g → 7,5 g ; 1,6 c. à soupe → 1,5.
function roundAmount({ quantity, unit }: Amount, purpose: AmountPurpose): Amount {
  switch (unit) {
    case "g":
    case "ml": {
      const step = quantity < 10 ? 0.5 : quantity < 100 ? 1 : quantity < 1000 ? 5 : 10;
      return { quantity: Math.max(step, roundTo(quantity, step)), unit };
    }
    case "cl":
      return { quantity: Math.max(0.5, roundTo(quantity, quantity < 10 ? 0.5 : 1)), unit };
    case "kg":
    case "l":
      return { quantity: Math.max(0.05, roundTo(quantity, 0.05)), unit };
    case null:
      return {
        quantity:
          purpose === "courses"
            ? Math.ceil(quantity - 1e-9)
            : Math.max(0.5, roundTo(quantity, 0.5)),
        unit,
      };
    default:
      // Cuillères, pincées.
      return { quantity: Math.max(0.5, roundTo(quantity, 0.5)), unit };
  }
}

// Moins d'un kilo ou d'un litre se lit mieux en g ou en cl : 0,375 kg → 375 g.
function normalizeAmount({ quantity, unit }: Amount): Amount {
  if (unit === "kg" && quantity < 1) return { quantity: quantity * 1000, unit: "g" };
  if (unit === "l" && quantity < 1) return { quantity: quantity * 100, unit: "cl" };
  return { quantity, unit };
}

// La quantité d'un ingrédient pour un autre nombre de parts : recette pour 4, foyer de 3,
// 500 g → 375 g. Sans quantité (« sel ») : null, rien à adapter.
export function scaleAmount(
  quantity: number | null,
  unit: IngredientUnit | null,
  fromServings: number,
  toServings: number,
  purpose: AmountPurpose = "recette",
): Amount | null {
  if (quantity === null || !(fromServings > 0) || !(toServings > 0)) return null;
  const scaled = normalizeAmount({ quantity: (quantity * toServings) / fromServings, unit });
  const rounded = roundAmount(scaled, purpose);
  // Les pas de 0,05 ou 0,5 laissent des restes flottants (0,15000000000000002).
  return { quantity: Math.round(rounded.quantity * 100) / 100, unit: rounded.unit };
}

const UNIT_LABELS: Record<IngredientUnit, [string, string]> = {
  g: ["g", "g"],
  kg: ["kg", "kg"],
  ml: ["ml", "ml"],
  cl: ["cl", "cl"],
  l: ["l", "l"],
  cuillere_cafe: ["c. à café", "c. à café"],
  cuillere_soupe: ["c. à soupe", "c. à soupe"],
  pincee: ["pincée", "pincées"],
};

const numberFormat = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

// « 375 g », « 1,5 c. à soupe », « 2 pincées », « 3 » (des pièces : le nom suit à l'écran).
export function formatAmount({ quantity, unit }: Amount): string {
  const number = numberFormat.format(quantity);
  if (unit === null) return number;
  const [singular, plural] = UNIT_LABELS[unit];
  return `${number} ${quantity >= 2 ? plural : singular}`;
}

// ─── calories et macros ──────────────────────────────────

// Un aliment Ciqual : valeurs pour 100 g (null : non mesuré par Ciqual), et le poids moyen
// d'une pièce pour ce qui se compte (un œuf, un oignon).
export type FoodNutrients = {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  unitWeightG: number | null;
};

// Volumes comptés comme de l'eau (1 ml ≈ 1 g) : une estimation, pas une pesée.
const GRAMS_PER_UNIT: Record<IngredientUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  cl: 10,
  l: 1000,
  cuillere_cafe: 5,
  cuillere_soupe: 15,
  pincee: 0.5,
};

// Le poids d'un ingrédient en grammes, ou null s'il ne se calcule pas (pas de quantité ; des
// pièces sans poids moyen connu).
export function ingredientGrams(
  quantity: number | null,
  unit: IngredientUnit | null,
  unitWeightG: number | null,
): number | null {
  if (quantity === null) return null;
  if (unit !== null) return quantity * GRAMS_PER_UNIT[unit];
  return unitWeightG === null ? null : quantity * unitWeightG;
}

export type MacroIngredient = {
  quantity: number | null;
  unit: IngredientUnit | null;
  // null : texte libre, aucun aliment Ciqual choisi.
  food: FoodNutrients | null;
};

export type Macros = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  // Ingrédients comptés et laissés de côté (sans aliment, sans quantité, pièce sans poids) :
  // l'écran dit « estimation » et, s'il en manque, combien.
  counted: number;
  uncounted: number;
};

// Calories et macros d'une part, arrondies au gramme et à la kcal. null : rien de comptable,
// l'écran n'affiche pas d'estimation. Une valeur absente de Ciqual compte pour 0.
export function macrosPerServing(ingredients: MacroIngredient[], servings: number): Macros | null {
  if (!(servings > 0)) return null;
  const total = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  let counted = 0;
  for (const { quantity, unit, food } of ingredients) {
    const grams = food ? ingredientGrams(quantity, unit, food.unitWeightG) : null;
    if (food === null || grams === null) continue;
    const ratio = grams / 100;
    total.kcal += (food.kcal ?? 0) * ratio;
    total.proteinG += (food.proteinG ?? 0) * ratio;
    total.carbsG += (food.carbsG ?? 0) * ratio;
    total.fatG += (food.fatG ?? 0) * ratio;
    counted += 1;
  }
  if (counted === 0) return null;
  return {
    kcal: Math.round(total.kcal / servings),
    proteinG: Math.round(total.proteinG / servings),
    carbsG: Math.round(total.carbsG / servings),
    fatG: Math.round(total.fatG / servings),
    counted,
    uncounted: ingredients.length - counted,
  };
}

// ─── écrans ──────────────────────────────────────────────

// « 1 part », « 4 parts ».
export function servingsLabel(servings: number): string {
  return servings === 1 ? "1 part" : `${servings} parts`;
}

// « 4 parts · 8 ingrédients » sous le nom d'une recette.
export function recipeSubtitle(servings: number, ingredientCount: number): string {
  if (ingredientCount === 0) return servingsLabel(servings);
  const ingredients = ingredientCount === 1 ? "1 ingrédient" : `${ingredientCount} ingrédients`;
  return `${servingsLabel(servings)} · ${ingredients}`;
}

// Sans accents ni majuscules : « creme » trouve « Crème brûlée ».
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesRecipeSearch(title: string, query: string): boolean {
  const folded = foldText(query);
  return folded === "" || foldText(title).includes(folded);
}

// La ligne « Recettes » de l'accueil : toujours là dès qu'on a un foyer (un carnet vide invite
// à écrire la première). Un foyer : son carnet s'ouvre directement ; plusieurs : l'écran de
// choix, comme la liste de courses.
export type RecipesShortcut =
  | { kind: "none" }
  | { kind: "one"; groupId: string; subtitle: string }
  | { kind: "many"; subtitle: string };

function recipeCountLabel(count: number): string {
  return count === 1 ? "1 recette" : `${count} recettes`;
}

export function recipesShortcut(
  groups: { id: string; name: string }[],
  recipesByGroup: Map<string, number>,
): RecipesShortcut {
  if (groups.length === 0) return { kind: "none" };
  if (groups.length === 1) {
    const [group] = groups;
    const count = recipesByGroup.get(group.id) ?? 0;
    return {
      kind: "one",
      groupId: group.id,
      subtitle:
        count === 0 ? "Écris ta première recette" : `${recipeCountLabel(count)} dans le carnet`,
    };
  }
  const total = groups.reduce((sum, group) => sum + (recipesByGroup.get(group.id) ?? 0), 0);
  return { kind: "many", subtitle: `${recipeCountLabel(total)} dans ${groups.length} carnets` };
}

// La couleur d'une vignette sans photo, toujours la même pour une recette : un petit hachage
// de son identifiant, parmi `count` couleurs.
export function recipeTileIndex(recipeId: string, count: number): number {
  let hash = 0;
  for (const char of recipeId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash % count;
}
