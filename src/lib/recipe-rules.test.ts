import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRecipeDraft,
  dietLabelForList,
  durationLabel,
  recipeListSubtitle,
  hasRecipeFilters,
  matchesRecipeFilters,
  NO_RECIPE_FILTERS,
  normalizeDiets,
  recipeMeta,
  carnetSuggestions,
  cookedLabel,
  formatAmount,
  fieldsFromIngredient,
  ingredientFromFields,
  ingredientGrams,
  macrosPerServing,
  matchesRecipeSearch,
  oftenCooked,
  parseIngredientLine,
  recipeByTitle,
  recipeSubtitle,
  recipesSubtitle,
  recipeTileIndex,
  scaleAmount,
  servingsLabel,
  type FoodNutrients,
} from "./recipe-rules.ts";

test("lire une ligne : quantité, unité et nom", () => {
  const cases: [string, string, number | null, string | null][] = [
    ["500 g de bœuf haché", "bœuf haché", 500, "g"],
    ["500g farine", "farine", 500, "g"],
    ["250 grammes de beurre", "beurre", 250, "g"],
    ["200 g d'épinards", "épinards", 200, "g"],
    ["200 g d’épinards", "épinards", 200, "g"],
    ["1,5 kg de pommes de terre", "pommes de terre", 1.5, "kg"],
    ["1.5 l de lait", "lait", 1.5, "l"],
    ["20 cl de crème liquide", "crème liquide", 20, "cl"],
    ["100 ml d'eau", "eau", 100, "ml"],
    ["2 c. à soupe d'huile d'olive", "huile d'olive", 2, "cuillere_soupe"],
    ["2 cuillères à soupe de sucre", "sucre", 2, "cuillere_soupe"],
    ["1 càs de moutarde", "moutarde", 1, "cuillere_soupe"],
    ["1 c. à c. de cumin", "cumin", 1, "cuillere_cafe"],
    ["1 cuillère à café de sel", "sel", 1, "cuillere_cafe"],
    ["Une pincée de sel", "sel", 1, "pincee"],
    ["2 pincées de muscade", "muscade", 2, "pincee"],
  ];
  for (const [raw, label, quantity, unit] of cases) {
    assert.deepEqual(parseIngredientLine(raw), { label, quantity, unit }, raw);
  }
});

test("lire une ligne : des pièces, sans unité", () => {
  assert.deepEqual(parseIngredientLine("2 œufs"), { label: "œufs", quantity: 2, unit: null });
  assert.deepEqual(parseIngredientLine("3 gousses d'ail"), {
    label: "gousses d'ail",
    quantity: 3,
    unit: null,
  });
  assert.deepEqual(parseIngredientLine("un oignon"), { label: "oignon", quantity: 1, unit: null });
  // « g » et « l » ne sont des unités qu'en mot entier.
  assert.deepEqual(parseIngredientLine("4 lardons"), { label: "lardons", quantity: 4, unit: null });
  assert.deepEqual(parseIngredientLine("2 galettes"), {
    label: "galettes",
    quantity: 2,
    unit: null,
  });
  assert.deepEqual(parseIngredientLine("2 cassis"), { label: "cassis", quantity: 2, unit: null });
});

test("lire une ligne : fractions et fourchettes", () => {
  assert.deepEqual(parseIngredientLine("1/2 citron"), {
    label: "citron",
    quantity: 0.5,
    unit: null,
  });
  assert.deepEqual(parseIngredientLine("½ citron"), { label: "citron", quantity: 0.5, unit: null });
  assert.deepEqual(parseIngredientLine("1 1/2 kg de farine"), {
    label: "farine",
    quantity: 1.5,
    unit: "kg",
  });
  assert.deepEqual(parseIngredientLine("1/3 l de lait"), {
    label: "lait",
    quantity: 0.33,
    unit: "l",
  });
  // Une fourchette : le plus grand, pour en avoir assez.
  assert.deepEqual(parseIngredientLine("2 à 3 tomates"), {
    label: "tomates",
    quantity: 3,
    unit: null,
  });
  assert.deepEqual(parseIngredientLine("2-3 tomates"), {
    label: "tomates",
    quantity: 3,
    unit: null,
  });
});

test("lire une ligne : ce qui ne se lit pas reste en texte libre", () => {
  for (const raw of [
    "sel",
    "Poivre du moulin",
    "un peu de persil",
    "1 l",
    "0 g de sucre",
    "1/0 citron",
  ]) {
    assert.deepEqual(parseIngredientLine(raw), { label: raw, quantity: null, unit: null }, raw);
  }
  // Espaces en trop rangés, comme le fait la base.
  assert.deepEqual(parseIngredientLine("  500   g  de   riz "), {
    label: "riz",
    quantity: 500,
    unit: "g",
  });
  // Trop grand pour la colonne : texte libre.
  assert.equal(parseIngredientLine("200000 g de farine").quantity, null);
  // Le nom ne dépasse jamais la colonne.
  assert.equal(parseIngredientLine(`2 ${"a".repeat(200)}`).label.length, 80);
});

test("adapter aux parts : la règle de trois, arrondie à ce qui se mesure", () => {
  // Recette pour 4, foyer de 3.
  assert.deepEqual(scaleAmount(500, "g", 4, 3), { quantity: 375, unit: "g" });
  assert.deepEqual(scaleAmount(100, "g", 3, 1), { quantity: 35, unit: "g" });
  // Au-delà de 20 g, au 5 près : 40 g pour 6 → 26,7 g pour 4 → 25 g, pas « 27 g ».
  assert.deepEqual(scaleAmount(40, "g", 6, 4), { quantity: 25, unit: "g" });
  assert.deepEqual(scaleAmount(15, "g", 1, 1), { quantity: 15, unit: "g" });
  assert.deepEqual(scaleAmount(1000, "g", 3, 1), { quantity: 335, unit: "g" });
  assert.deepEqual(scaleAmount(15, "g", 4, 2), { quantity: 7.5, unit: "g" });
  assert.deepEqual(scaleAmount(2, "cuillere_soupe", 4, 3), {
    quantity: 1.5,
    unit: "cuillere_soupe",
  });
  assert.deepEqual(scaleAmount(1, "pincee", 4, 1), { quantity: 0.5, unit: "pincee" });
  assert.deepEqual(scaleAmount(2.5, "kg", 4, 6), { quantity: 3.75, unit: "kg" });
  // Moins d'un kilo ou d'un litre : en g ou en cl.
  assert.deepEqual(scaleAmount(1, "kg", 4, 3), { quantity: 750, unit: "g" });
  assert.deepEqual(scaleAmount(1, "l", 4, 1), { quantity: 25, unit: "cl" });
  // Même nombre de parts : rien ne bouge.
  assert.deepEqual(scaleAmount(20, "cl", 4, 4), { quantity: 20, unit: "cl" });
});

test("adapter aux parts : une pièce s'achète entière, pas à l'écran de la recette", () => {
  assert.deepEqual(scaleAmount(2, null, 4, 3), { quantity: 1.5, unit: null });
  assert.deepEqual(scaleAmount(2, null, 4, 3, "courses"), { quantity: 2, unit: null });
  assert.deepEqual(scaleAmount(3, null, 4, 4, "courses"), { quantity: 3, unit: null });
  assert.deepEqual(scaleAmount(1, null, 4, 1), { quantity: 0.5, unit: null });
  assert.deepEqual(scaleAmount(1, null, 4, 1, "courses"), { quantity: 1, unit: null });
});

test("adapter aux parts : sans quantité ou parts impossibles, rien", () => {
  assert.equal(scaleAmount(null, null, 4, 3), null);
  assert.equal(scaleAmount(500, "g", 0, 3), null);
  assert.equal(scaleAmount(500, "g", 4, 0), null);
});

test("écrire une quantité", () => {
  assert.equal(formatAmount({ quantity: 375, unit: "g" }), "375 g");
  assert.equal(formatAmount({ quantity: 1.5, unit: "cuillere_soupe" }), "1 ½ c. à soupe");
  // Les pièces en fractions (« ½ oignon »), les poids gardent la virgule.
  assert.equal(formatAmount({ quantity: 0.5, unit: null }), "½");
  assert.equal(formatAmount({ quantity: 2.5, unit: null }), "2 ½");
  assert.equal(formatAmount({ quantity: 7.5, unit: "g" }), "7,5 g");
  assert.equal(formatAmount({ quantity: 1, unit: "pincee" }), "1 pincée");
  assert.equal(formatAmount({ quantity: 2, unit: "pincee" }), "2 pincées");
  assert.equal(formatAmount({ quantity: 3, unit: null }), "3");
  assert.equal(formatAmount({ quantity: 1500, unit: "g" }), "1500 g");
});

test("poids en grammes", () => {
  assert.equal(ingredientGrams(500, "g", null), 500);
  assert.equal(ingredientGrams(1.5, "kg", null), 1500);
  assert.equal(ingredientGrams(20, "cl", null), 200);
  assert.equal(ingredientGrams(2, "cuillere_soupe", null), 30);
  // Des pièces : le poids moyen de l'aliment, sinon on ne sait pas.
  assert.equal(ingredientGrams(2, null, 60), 120);
  assert.equal(ingredientGrams(2, null, null), null);
  assert.equal(ingredientGrams(null, null, 60), null);
});

const beef: FoodNutrients = { kcal: 250, proteinG: 26, carbsG: 0, fatG: 15, unitWeightG: null };
const pasta: FoodNutrients = { kcal: 350, proteinG: 12, carbsG: 70, fatG: 1.5, unitWeightG: null };
const egg: FoodNutrients = { kcal: 140, proteinG: 12.5, carbsG: 0.7, fatG: 10, unitWeightG: 60 };

test("macros par part : la somme des ingrédients, divisée par les parts", () => {
  const macros = macrosPerServing(
    [
      { quantity: 500, unit: "g", food: beef },
      { quantity: 400, unit: "g", food: pasta },
      { quantity: 2, unit: null, food: egg },
    ],
    4,
  );
  // Bœuf 1250 kcal + pâtes 1400 + œufs 168 = 2818 ; ÷ 4.
  assert.deepEqual(macros, {
    kcal: 705,
    proteinG: 48,
    carbsG: 70,
    fatG: 23,
    counted: 3,
    uncounted: 0,
  });
});

test("macros par part : ce qui ne se compte pas est laissé de côté, et dit", () => {
  const macros = macrosPerServing(
    [
      { quantity: 500, unit: "g", food: beef },
      // Texte libre, sans quantité, pièce sans poids moyen.
      { quantity: 1, unit: null, food: null },
      { quantity: null, unit: null, food: pasta },
      { quantity: 2, unit: null, food: { ...egg, unitWeightG: null } },
    ],
    2,
  );
  assert.deepEqual(macros, {
    kcal: 625,
    proteinG: 65,
    carbsG: 0,
    fatG: 38,
    counted: 1,
    // Sans quantité (« au goût ») : pas signalé ; texte libre et pièce sans poids : signalés.
    uncounted: 2,
  });
});

test("macros par part : une valeur absente de Ciqual compte pour 0", () => {
  const partial: FoodNutrients = {
    kcal: 100,
    proteinG: null,
    carbsG: null,
    fatG: null,
    unitWeightG: null,
  };
  assert.deepEqual(macrosPerServing([{ quantity: 100, unit: "g", food: partial }], 1), {
    kcal: 100,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    counted: 1,
    uncounted: 0,
  });
});

test("macros par part : rien de comptable, pas d'estimation", () => {
  assert.equal(macrosPerServing([], 4), null);
  assert.equal(macrosPerServing([{ quantity: null, unit: null, food: null }], 4), null);
  assert.equal(macrosPerServing([{ quantity: 500, unit: "g", food: beef }], 0), null);
});

test("écrans : parts et sous-titre d'une recette", () => {
  assert.equal(servingsLabel(1), "1 part");
  assert.equal(servingsLabel(4), "4 parts");
  assert.equal(recipeSubtitle(4, 8), "4 parts · 8 ingrédients");
  assert.equal(recipeSubtitle(2, 1), "2 parts · 1 ingrédient");
  assert.equal(recipeSubtitle(6, 0), "6 parts");
});

test("écrans : chercher sans accents ni majuscules", () => {
  assert.ok(matchesRecipeSearch("Crème brûlée", "creme"));
  assert.ok(matchesRecipeSearch("Pâtes à la bolognaise", "BOLO"));
  assert.ok(matchesRecipeSearch("Gratin", "  "));
  assert.ok(!matchesRecipeSearch("Gratin", "quiche"));
});

test("écrans : la ligne Recettes d'un foyer", () => {
  assert.equal(recipesSubtitle(0), "Écris ta première recette");
  assert.equal(recipesSubtitle(1), "1 recette dans le carnet");
  assert.equal(recipesSubtitle(12), "12 recettes dans le carnet");
});

test("écrans : une vignette garde sa couleur", () => {
  const index = recipeTileIndex("3f2a9c1e-0000-4000-8000-000000000000", 3);
  assert.ok(index >= 0 && index < 3);
  assert.equal(recipeTileIndex("3f2a9c1e-0000-4000-8000-000000000000", 3), index);
});

const form = {
  title: "  Pot-au-feu ",
  servings: 6,
  ingredients: [
    { name: " Plat de côte ", quantity: "1 kg", foodId: 42 },
    { name: "   ", quantity: "3", foodId: null },
    { name: "Gros sel", quantity: "", foodId: null },
  ],
  steps: ["  Écumer\nle bouillon  ", "", "Servir"],
  chefTip: "  Écume   souvent :\nle bouillon reste clair. ",
  category: "viande" as const,
  diets: ["sans_gluten" as const],
  totalMinutes: " 180 ",
  budget: 2,
};

test("écrire : le brouillon envoyé à la base", () => {
  assert.deepEqual(buildRecipeDraft(form), {
    ok: true,
    draft: {
      title: "Pot-au-feu",
      servings: 6,
      ingredients: [
        { raw: "1 kg Plat de côte", label: "Plat de côte", quantity: 1, unit: "kg", foodId: 42 },
        { raw: "Gros sel", label: "Gros sel", quantity: null, unit: null, foodId: null },
      ],
      steps: ["Écumer le bouillon", "Servir"],
      chefTip: "Écume souvent : le bouillon reste clair.",
      category: "viande",
      diets: ["sans_gluten"],
      totalMinutes: 180,
      budget: 2,
    },
  });
});

test("écrire : une astuce vide n'est pas une astuce", () => {
  const result = buildRecipeDraft({ ...form, chefTip: "   " });
  assert.equal(result.ok && result.draft.chefTip, null);
});

test("écrire : un message clair pour chaque limite", () => {
  const errorsOf = (changes: Partial<typeof form>) => {
    const result = buildRecipeDraft({ ...form, ...changes });
    return result.ok ? null : result.errors;
  };
  assert.deepEqual(errorsOf({ title: "  " }), { title: "Donne un nom à la recette." });
  assert.deepEqual(errorsOf({ title: "a".repeat(81) }), {
    title: "Le nom fait 80 caractères au plus.",
  });
  assert.deepEqual(
    errorsOf({
      ingredients: Array.from({ length: 61 }, () => ({ name: "sel", quantity: "", foodId: null })),
    }),
    { ingredients: "60 ingrédients au plus." },
  );
  assert.deepEqual(errorsOf({ steps: ["a".repeat(501)] }), {
    steps: "Une étape fait 500 caractères au plus.",
  });
  assert.deepEqual(errorsOf({ steps: Array.from({ length: 41 }, () => "Remuer") }), {
    steps: "40 étapes au plus.",
  });
  assert.deepEqual(errorsOf({ chefTip: "a".repeat(301) }), {
    chefTip: "L’astuce fait 300 caractères au plus.",
  });
  // Sans ingrédient ni étape : permis (on peut noter une idée et la compléter plus tard).
  assert.equal(buildRecipeDraft({ ...form, ingredients: [], steps: [] }).ok, true);
});

test("écrire : un nom et une quantité deviennent une ligne", () => {
  assert.deepEqual(ingredientFromFields("Plat de côte", "1 kg"), {
    raw: "1 kg Plat de côte",
    label: "Plat de côte",
    quantity: 1,
    unit: "kg",
  });
  assert.deepEqual(ingredientFromFields("Huile d'olive", "2 c. à s."), {
    raw: "2 c. à s. Huile d'olive",
    label: "Huile d'olive",
    quantity: 2,
    unit: "cuillere_soupe",
  });
  assert.deepEqual(ingredientFromFields("Carottes", "6"), {
    raw: "6 Carottes",
    label: "Carottes",
    quantity: 6,
    unit: null,
  });
  // Ce que la quantité dit de plus reste lisible à côté du nom.
  assert.deepEqual(ingredientFromFields("Ail", "3 gousses"), {
    raw: "3 gousses Ail",
    label: "Ail (gousses)",
    quantity: 3,
    unit: null,
  });
  assert.deepEqual(ingredientFromFields("Sel", "au goût"), {
    raw: "au goût Sel",
    label: "Sel (au goût)",
    quantity: null,
    unit: null,
  });
  assert.deepEqual(ingredientFromFields(" Gros   sel ", ""), {
    raw: "Gros sel",
    label: "Gros sel",
    quantity: null,
    unit: null,
  });
});

test("écrire : modifier rend les deux champs, et les réenregistrer ne change rien", () => {
  for (const [name, quantity] of [
    ["Plat de côte", "1 kg"],
    ["Huile d'olive", "2 c. à soupe"],
    ["Ail", "3 gousses"],
    ["Sel", "au goût"],
    ["Gros sel", ""],
    ["Lait", "1,5 l"],
  ]) {
    const saved = ingredientFromFields(name, quantity);
    const fields = fieldsFromIngredient(saved);
    const again = ingredientFromFields(fields.name, fields.quantity);
    assert.deepEqual(
      [again.label, again.quantity, again.unit],
      [saved.label, saved.quantity, saved.unit],
      `${name} / ${quantity}`,
    );
  }
  assert.deepEqual(fieldsFromIngredient({ label: "Plat de côte", quantity: 1, unit: "kg" }), {
    name: "Plat de côte",
    quantity: "1 kg",
  });
});

test("souvent cuisiné : au moins 2 fois, les plus cuisinées d'abord", () => {
  assert.deepEqual(oftenCooked([]), []);
  // Une seule fois, ou un plat sans recette : pas « souvent ».
  assert.deepEqual(oftenCooked(["gratin", null, null]), []);
  assert.deepEqual(oftenCooked(["gratin", "potaufeu", "potaufeu", "gratin", "potaufeu", "chili"]), [
    { recipeId: "potaufeu", count: 3 },
    { recipeId: "gratin", count: 2 },
  ]);
  // À égalité, la plus récente (en tête de liste) d'abord ; jamais plus de `limit`.
  assert.deepEqual(oftenCooked(["chili", "gratin", "chili", "gratin", "soupe", "soupe"]), [
    { recipeId: "chili", count: 2 },
    { recipeId: "gratin", count: 2 },
  ]);
  assert.equal(oftenCooked(["a", "a", "b", "b", "c", "c"], 3).length, 3);
  assert.equal(cookedLabel(3), "Cuisinée 3 fois");
});

const carnet = [
  { id: "1", title: "Chili con carne" },
  { id: "2", title: "Gratin dauphinois" },
  { id: "3", title: "Pot-au-feu" },
  { id: "4", title: "Crème brûlée" },
];

test("le carnet dans le vote : suggestions, sans les plats déjà proposés", () => {
  assert.deepEqual(
    carnetSuggestions(carnet, "", ["pot-au-feu"]).map((recipe) => recipe.id),
    ["1", "2", "4"],
  );
  assert.deepEqual(
    carnetSuggestions(carnet, "creme", []).map((recipe) => recipe.id),
    ["4"],
  );
  assert.equal(carnetSuggestions(carnet, "", [], 2).length, 2);
});

test("le carnet dans le vote : un nom identique est relié, un nom proche non", () => {
  assert.equal(recipeByTitle(carnet, "  pot-au-feu ")?.id, "3");
  assert.equal(recipeByTitle(carnet, "Creme   brulee")?.id, "4");
  assert.equal(recipeByTitle(carnet, "Pot au feu de mamie"), null);
});

test("étiquettes : durée, budget et régimes sous le titre", () => {
  assert.equal(durationLabel(35), "35 min");
  assert.equal(durationLabel(60), "1 h");
  assert.equal(durationLabel(90), "1 h 30");
  assert.equal(
    recipeMeta(35, 1, ["vegan", "vegetarien", "sans_gluten", "sans_lactose", "sans_porc"]),
    "35 min · € · Vegan, sans gluten, sans lactose",
  );
  assert.equal(recipeMeta(120, 3, ["sans_porc"]), "2 h · €€€ · Sans porc");
  assert.equal(recipeMeta(20, 1, []), "20 min · €");
  assert.equal(recipeMeta(null, null, []), null);
  // Le type de plat rejoint la ligne ; « Végé » ne double pas un régime végétarien.
  assert.equal(recipeMeta(20, 1, [], "viande"), "20 min · € · Viande");
  assert.equal(recipeMeta(45, 1, ["vegan", "vegetarien"], "vege"), "45 min · € · Vegan");
  assert.equal(recipeMeta(null, null, [], "vege"), "Végé");
});

test("étiquettes : vegan dit végétarien, végétarien dit sans porc", () => {
  assert.deepEqual(normalizeDiets(["vegan"]), ["vegetarien", "vegan", "sans_porc"]);
  assert.deepEqual(normalizeDiets(["sans_lactose", "vegetarien"]), [
    "vegetarien",
    "sans_porc",
    "sans_lactose",
  ]);
  assert.deepEqual(normalizeDiets([]), []);
});

test("filtres du carnet : type, rapide et petit budget se combinent", () => {
  const curry = { category: "vege" as const, totalMinutes: 25, budget: 1 };
  const blanquette = { category: "viande" as const, totalMinutes: 120, budget: 3 };
  const sansInfos = { category: null, totalMinutes: null, budget: null };
  const recipes = [curry, blanquette, sansInfos];
  const shown = (filters: Parameters<typeof matchesRecipeFilters>[1]) =>
    recipes.filter((recipe) => matchesRecipeFilters(recipe, filters));

  assert.equal(shown(NO_RECIPE_FILTERS).length, 3);
  assert.deepEqual(shown({ ...NO_RECIPE_FILTERS, category: "viande" }), [blanquette]);
  assert.deepEqual(shown({ ...NO_RECIPE_FILTERS, isQuick: true }), [curry]);
  assert.deepEqual(shown({ category: "vege", isQuick: true, isCheap: true }), [curry]);
  assert.deepEqual(shown({ ...NO_RECIPE_FILTERS, category: "dessert" }), []);
  assert.equal(hasRecipeFilters(NO_RECIPE_FILTERS), false);
  assert.equal(hasRecipeFilters({ ...NO_RECIPE_FILTERS, isCheap: true }), true);
});

test("carnet : durée, budget et un régime sous le nom", () => {
  const chili = { totalMinutes: 45, budget: 1, servings: 4, ingredientCount: 12 };
  assert.equal(
    recipeListSubtitle({ ...chili, diets: ["vegetarien", "vegan"] }),
    "45 min · € · Vegan",
  );
  assert.equal(recipeListSubtitle({ ...chili, budget: 2, diets: [] }), "45 min · €€");
  assert.equal(
    recipeListSubtitle({
      totalMinutes: null,
      budget: null,
      diets: [],
      servings: 4,
      ingredientCount: 8,
    }),
    "4 parts · 8 ingrédients",
  );
  assert.equal(dietLabelForList(["sans_porc", "sans_gluten"]), "Sans gluten");
  assert.equal(dietLabelForList(["vegetarien", "sans_porc"]), null);
});

test("écrire : le temps total, en minutes, facultatif", () => {
  const minutes = (totalMinutes: string) => buildRecipeDraft({ ...form, totalMinutes });
  const ok = minutes("");
  assert.ok(ok.ok && ok.draft.totalMinutes === null);
  for (const wrong of ["abc", "0", "2000", "1h30", "12.5"]) {
    const result = minutes(wrong);
    assert.ok(!result.ok && result.errors.totalMinutes, wrong);
  }
  const quick = minutes("25");
  assert.ok(quick.ok && quick.draft.totalMinutes === 25);
});
