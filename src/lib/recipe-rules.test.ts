import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatAmount,
  ingredientGrams,
  macrosPerServing,
  matchesRecipeSearch,
  parseIngredientLine,
  recipeSubtitle,
  recipesShortcut,
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
  assert.deepEqual(scaleAmount(100, "g", 3, 1), { quantity: 33, unit: "g" });
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
  assert.equal(formatAmount({ quantity: 1.5, unit: "cuillere_soupe" }), "1,5 c. à soupe");
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
    uncounted: 3,
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

test("écrans : la ligne Recettes de l'accueil", () => {
  const famille = { id: "f", name: "Famille" };
  const coloc = { id: "c", name: "Coloc" };
  assert.deepEqual(recipesShortcut([], new Map()), { kind: "none" });
  assert.deepEqual(recipesShortcut([famille], new Map()), {
    kind: "one",
    groupId: "f",
    subtitle: "Écris ta première recette",
  });
  assert.deepEqual(recipesShortcut([famille], new Map([["f", 1]])), {
    kind: "one",
    groupId: "f",
    subtitle: "1 recette dans le carnet",
  });
  assert.deepEqual(recipesShortcut([famille, coloc], new Map([["f", 5]])), {
    kind: "many",
    subtitle: "5 recettes dans 2 carnets",
  });
});

test("écrans : une vignette garde sa couleur", () => {
  const index = recipeTileIndex("3f2a9c1e-0000-4000-8000-000000000000", 3);
  assert.ok(index >= 0 && index < 3);
  assert.equal(recipeTileIndex("3f2a9c1e-0000-4000-8000-000000000000", 3), index);
});
