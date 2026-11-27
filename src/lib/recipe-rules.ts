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
  // Ingrédients comptés, et ceux laissés de côté alors qu'ils ont une quantité (sans aliment, ou
  // pièce sans poids) : l'écran dit « estimation » et, s'il en manque, combien. Un assaisonnement
  // « au goût », sans quantité, ne pèse rien : il n'est pas signalé.
  counted: number;
  uncounted: number;
};

// Calories et macros d'une part, arrondies au gramme et à la kcal. null : rien de comptable,
// l'écran n'affiche pas d'estimation. Une valeur absente de Ciqual compte pour 0.
export function macrosPerServing(ingredients: MacroIngredient[], servings: number): Macros | null {
  if (!(servings > 0)) return null;
  const total = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  let counted = 0;
  let uncounted = 0;
  for (const { quantity, unit, food } of ingredients) {
    const grams = food ? ingredientGrams(quantity, unit, food.unitWeightG) : null;
    if (food === null || grams === null) {
      if (quantity !== null) uncounted += 1;
      continue;
    }
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
    uncounted,
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

// La ligne « Recettes » d'un foyer sur l'accueil : un carnet vide invite à écrire la première.
export function recipesSubtitle(count: number): string {
  if (count === 0) return "Écris ta première recette";
  return `${count === 1 ? "1 recette" : `${count} recettes`} dans le carnet`;
}

// La couleur d'une vignette sans photo, toujours la même pour une recette : un petit hachage
// de son identifiant, parmi `count` couleurs.
export function recipeTileIndex(recipeId: string, count: number): number {
  let hash = 0;
  for (const char of recipeId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash % count;
}

// ─── écrire une recette ──────────────────────────────────

// Mêmes limites que la base (recipes, recipe_ingredients, save_recipe).
export const RECIPE_TITLE_MAX_LENGTH = 80;
export const RECIPE_MAX_INGREDIENTS = 60;
export const RECIPE_MAX_STEPS = 40;
export const RECIPE_STEP_MAX_LENGTH = 500;
export const RECIPE_CHEF_TIP_MAX_LENGTH = 300;

// Une ligne du formulaire : le nom et la quantité tapés dans deux champs (comme la liste de
// courses), et l'aliment Ciqual choisi pour ce nom (perdu dès que le nom change : l'écran
// remet null).
export type IngredientFieldsInput = { name: string; quantity: string; foodId: number | null };

export type RecipeFormInput = {
  title: string;
  servings: number;
  ingredients: IngredientFieldsInput[];
  steps: string[];
  // L'astuce du chef, facultative : vide = pas d'astuce.
  chefTip: string;
  // Le type de plat (filtres du carnet), facultatif.
  category: RecipeCategory | null;
  diets: RecipeDiet[];
};

export type RecipeIngredientDraft = ParsedIngredient & { raw: string; foodId: number | null };

export type RecipeFormResult =
  | {
      ok: true;
      draft: {
        title: string;
        servings: number;
        ingredients: RecipeIngredientDraft[];
        steps: string[];
        chefTip: string | null;
        category: RecipeCategory | null;
        diets: RecipeDiet[];
      };
    }
  | {
      ok: false;
      errors: { title?: string; ingredients?: string; steps?: string; chefTip?: string };
    };

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// Ce que l'écran envoie à save_recipe : texte rangé, lignes et étapes vides retirées, chaque
// ingrédient lu. Les limites sont vérifiées ici pour un message clair ; la base les vérifie
// aussi (le serveur ne fait jamais confiance à l'app).
export function buildRecipeDraft(form: RecipeFormInput): RecipeFormResult {
  const errors: { title?: string; ingredients?: string; steps?: string; chefTip?: string } = {};

  const title = tidy(form.title);
  if (title === "") errors.title = "Donne un nom à la recette.";
  else if (title.length > RECIPE_TITLE_MAX_LENGTH)
    errors.title = `Le nom fait ${RECIPE_TITLE_MAX_LENGTH} caractères au plus.`;

  const lines = form.ingredients.filter((line) => tidy(line.name) !== "");
  if (lines.length > RECIPE_MAX_INGREDIENTS)
    errors.ingredients = `${RECIPE_MAX_INGREDIENTS} ingrédients au plus.`;

  // Rangées comme la base les range (tidy_text) : un seul espace, retours à la ligne compris.
  const steps = form.steps.map(tidy).filter((step) => step !== "");
  if (steps.length > RECIPE_MAX_STEPS) errors.steps = `${RECIPE_MAX_STEPS} étapes au plus.`;
  else if (steps.some((step) => step.length > RECIPE_STEP_MAX_LENGTH))
    errors.steps = `Une étape fait ${RECIPE_STEP_MAX_LENGTH} caractères au plus.`;

  const chefTip = tidy(form.chefTip);
  if (chefTip.length > RECIPE_CHEF_TIP_MAX_LENGTH)
    errors.chefTip = `L’astuce fait ${RECIPE_CHEF_TIP_MAX_LENGTH} caractères au plus.`;

  if (errors.title || errors.ingredients || errors.steps || errors.chefTip)
    return { ok: false, errors };
  return {
    ok: true,
    draft: {
      title,
      servings: form.servings,
      ingredients: lines.map((line) => ({
        ...ingredientFromFields(line.name, line.quantity),
        foodId: line.foodId,
      })),
      steps,
      chefTip: chefTip === "" ? null : chefTip,
      category: form.category,
      diets: normalizeDiets(form.diets),
    },
  };
}

// Même limite que la quantité d'un article de courses.
export const INGREDIENT_QUANTITY_MAX_LENGTH = 20;

// Le nom et la quantité tapés → la ligne enregistrée. « Plat de côte » + « 1 kg » → 1 kg,
// recalculé selon les parts. Ce que la quantité dit de plus (« 3 gousses », « au goût ») reste
// lisible à côté du nom : « Ail (gousses) », « Sel (au goût) ». raw garde la ligne entière.
export function ingredientFromFields(
  name: string,
  quantityText: string,
): ParsedIngredient & { raw: string } {
  const cleanName = tidy(name);
  const cleanQuantity = tidy(quantityText);
  const raw = (cleanQuantity === "" ? cleanName : `${cleanQuantity} ${cleanName}`).slice(
    0,
    INGREDIENT_RAW_MAX_LENGTH,
  );
  const withNote = (note: string) =>
    (note === "" ? cleanName : `${cleanName} (${note})`).slice(0, INGREDIENT_LABEL_MAX_LENGTH);

  if (cleanQuantity === "") return { raw, label: withNote(""), quantity: null, unit: null };
  const read = readQuantity(cleanQuantity);
  if (!read || !(read.quantity > 0) || read.quantity > QUANTITY_MAX) {
    return { raw, label: withNote(cleanQuantity), quantity: null, unit: null };
  }
  let rest = read.rest.trim();
  let unit: IngredientUnit | null = null;
  const unitRead = readUnit(rest);
  if (unitRead) {
    unit = unitRead.unit;
    rest = unitRead.rest.trim();
  }
  return { raw, label: withNote(rest), quantity: Math.round(read.quantity * 100) / 100, unit };
}

// L'inverse, pour modifier une recette : la ligne enregistrée → les deux champs.
export function fieldsFromIngredient(ingredient: ParsedIngredient): {
  name: string;
  quantity: string;
} {
  return {
    name: ingredient.label,
    quantity:
      ingredient.quantity === null
        ? ""
        : formatAmount({ quantity: ingredient.quantity, unit: ingredient.unit }),
  };
}

// ─── souvent cuisiné ─────────────────────────────────────

// Une recette compte comme cuisinée quand elle gagne un vote du foyer. « Souvent » : au moins
// 2 fois. Les plus cuisinées d'abord, à égalité la plus récente ; `limit` au plus.
export type CookedCount = { recipeId: string; count: number };

export function oftenCooked(
  // Les recettes gagnantes des votes clos, du plus récent au plus ancien (null : un plat sans
  // recette).
  winners: (string | null)[],
  limit = 2,
): CookedCount[] {
  const counts = new Map<string, { count: number; latest: number }>();
  winners.forEach((recipeId, index) => {
    if (recipeId === null) return;
    const current = counts.get(recipeId);
    if (current) current.count += 1;
    else counts.set(recipeId, { count: 1, latest: index });
  });
  return [...counts.entries()]
    .filter(([, { count }]) => count >= 2)
    .sort(([, a], [, b]) => b.count - a.count || a.latest - b.latest)
    .slice(0, limit)
    .map(([recipeId, { count }]) => ({ recipeId, count }));
}

// « Cuisinée 3 fois ».
export function cookedLabel(count: number): string {
  return `Cuisinée ${count} fois`;
}

// ─── le carnet dans le vote ──────────────────────────────

type CarnetEntry = { id: string; title: string };

// Les recettes du carnet proposées sous « Proposer un plat » : sans rien taper, les premières
// du carnet ; en tapant, celles dont le nom contient le texte (sans accents ni majuscules).
// Jamais un plat déjà proposé dans ce vote.
export function carnetSuggestions<T extends CarnetEntry>(
  recipes: T[],
  typed: string,
  proposedNames: string[],
  limit = 5,
): T[] {
  const proposed = new Set(proposedNames.map(foldText));
  return recipes
    .filter((recipe) => !proposed.has(foldText(recipe.title)))
    .filter((recipe) => matchesRecipeSearch(recipe.title, typed))
    .slice(0, limit);
}

// Un plat tapé à la main qui porte exactement le nom d'une recette du carnet y est relié : le
// résultat pourra montrer la recette. Un nom seulement proche ne l'est pas (on ne devine pas).
export function recipeByTitle<T extends CarnetEntry>(recipes: T[], name: string): T | null {
  const wanted = foldText(name).replace(/\s+/g, " ");
  return recipes.find((recipe) => foldText(recipe.title).replace(/\s+/g, " ") === wanted) ?? null;
}

// ─── étiquettes ──────────────────────────────────────────

export type RecipeDiet = "vegetarien" | "vegan" | "sans_porc" | "sans_gluten" | "sans_lactose";

// Dans l'ordre du formulaire.
export const RECIPE_DIETS: RecipeDiet[] = [
  "vegetarien",
  "vegan",
  "sans_porc",
  "sans_gluten",
  "sans_lactose",
];

export const DIET_LABELS: Record<RecipeDiet, string> = {
  vegetarien: "Végétarien",
  vegan: "Vegan",
  sans_porc: "Sans porc",
  sans_gluten: "Sans gluten",
  sans_lactose: "Sans lactose",
};

// « 35 min », « 1 h », « 1 h 30 ».
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0
    ? `${Math.floor(minutes / 60)} h`
    : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, "0")}`;
}

// La ligne sous le titre d'une recette : « 35 min · € · Vegan, sans gluten ». Vegan suffit (il
// dit végétarien) ; sans porc ne se dit que d'un plat qui pourrait en contenir (pas végétarien).
export function recipeMeta(
  totalMinutes: number | null,
  budget: number | null,
  diets: RecipeDiet[],
  category: RecipeCategory | null = null,
): string | null {
  const shown = diets.filter(
    (diet) =>
      !(diet === "vegetarien" && diets.includes("vegan")) &&
      !(diet === "sans_porc" && (diets.includes("vegetarien") || diets.includes("vegan"))),
  );
  const parts = [
    totalMinutes ? durationLabel(totalMinutes) : null,
    budget ? "€".repeat(budget) : null,
    // « Végé » se lit déjà dans les régimes (Végétarien, Vegan) : pas de doublon.
    category && !(category === "vege" && shown.length > 0) ? CATEGORY_LABELS[category] : null,
    shown.length > 0
      ? shown
          .map((diet, index) => (index === 0 ? DIET_LABELS[diet] : DIET_LABELS[diet].toLowerCase()))
          .join(", ")
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Vegan dit végétarien ; végétarien dit sans porc. Les filtres et la ligne d'infos s'appuient
// sur ces implications : on les pose à l'enregistrement, dans l'ordre du formulaire.
export function normalizeDiets(diets: RecipeDiet[]): RecipeDiet[] {
  const chosen = new Set(diets);
  if (chosen.has("vegan")) chosen.add("vegetarien");
  if (chosen.has("vegetarien")) chosen.add("sans_porc");
  return RECIPE_DIETS.filter((diet) => chosen.has(diet));
}

// ─── type de plat et filtres du carnet (2026-11-27) ──────

export type RecipeCategory = "viande" | "poisson" | "vege" | "dessert";

// Dans l'ordre des filter chips et du formulaire.
export const RECIPE_CATEGORIES: RecipeCategory[] = ["viande", "poisson", "vege", "dessert"];

export const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  viande: "Viande",
  poisson: "Poisson",
  vege: "Végé",
  dessert: "Dessert",
};

// « Rapide » : préparation et cuisson comprises, jusqu'à 30 min.
export const QUICK_MAX_MINUTES = 30;

// Les filtres du carnet : un type à la fois, et deux interrupteurs qui s'ajoutent.
export type RecipeFilters = { category: RecipeCategory | null; isQuick: boolean; isCheap: boolean };

export const NO_RECIPE_FILTERS: RecipeFilters = { category: null, isQuick: false, isCheap: false };

export function hasRecipeFilters(filters: RecipeFilters): boolean {
  return filters.category !== null || filters.isQuick || filters.isCheap;
}

// Une recette sans durée ou sans budget connus ne passe pas ces filtres : on ne promet pas
// « rapide » ou « petit budget » sans le savoir.
export function matchesRecipeFilters(
  recipe: { category: RecipeCategory | null; totalMinutes: number | null; budget: number | null },
  filters: RecipeFilters,
): boolean {
  if (filters.category !== null && recipe.category !== filters.category) return false;
  if (filters.isQuick && (recipe.totalMinutes === null || recipe.totalMinutes > QUICK_MAX_MINUTES))
    return false;
  if (filters.isCheap && recipe.budget !== 1) return false;
  return true;
}

// Sous le nom d'une recette dans le carnet : ce que les filtres regardent, et le régime le
// plus parlant (« 45 min · € · Vegan »). Sans durée ni budget, les parts et les ingrédients.
export function recipeListSubtitle(recipe: {
  totalMinutes: number | null;
  budget: number | null;
  diets: RecipeDiet[];
  servings: number;
  ingredientCount: number;
}): string {
  const parts = [
    recipe.totalMinutes ? durationLabel(recipe.totalMinutes) : null,
    recipe.budget ? "€".repeat(recipe.budget) : null,
  ].filter((part): part is string => part !== null);
  const base =
    parts.length > 0 ? parts.join(" · ") : recipeSubtitle(recipe.servings, recipe.ingredientCount);
  const diet = dietLabelForList(recipe.diets);
  return diet ? `${base} · ${diet}` : base;
}

// Un seul régime dans la liste, le plus parlant. Végétarien se lit déjà dans le badge Végé ;
// sans porc et sans lactose restent sur la page de la recette.
export function dietLabelForList(diets: RecipeDiet[]): string | null {
  if (diets.includes("vegan")) return DIET_LABELS.vegan;
  if (diets.includes("sans_gluten")) return DIET_LABELS.sans_gluten;
  return null;
}
