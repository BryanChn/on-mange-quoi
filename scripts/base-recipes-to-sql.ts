// Recettes de base : un lot relu (scripts/base-recipes/lotN.json) → la migration SQL.
// Chaque ligne passe par ingredientFromFields, comme si elle était tapée dans l'app (nom +
// quantité). Ids fixes 00000000-0000-4000-8000-0000000000NN : relancer met à jour sans doublon.
//
//   node scripts/base-recipes-to-sql.ts scripts/base-recipes/lot2.json > supabase/migrations/…sql
//
// Avec un second argument (les aliments, en JSON : [{id, kcal, protein_g, carbs_g, fat_g,
// unit_weight_g}]), affiche sur stderr les calories par part et les lignes non comptées, à
// vérifier avant de livrer.
import { readFileSync } from "node:fs";

import { ingredientFromFields, macrosPerServing } from "../src/lib/recipe-rules.ts";

type Lot = {
  lot: number;
  unitWeights: [number, number, string][];
  recipes: {
    n: number;
    title: string;
    servings: number;
    minutes: number;
    budget: 1 | 2 | 3;
    diets: string[];
    steps: string[];
    // L'astuce du chef (300 caractères au plus), facultative.
    chefTip?: string;
    ingredients: [string, string, number | null][];
  }[];
};

type Food = {
  id: number;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  unit_weight_g: number | null;
};

const [lotPath, foodsPath] = process.argv.slice(2);
if (!lotPath)
  throw new Error("Usage : node scripts/base-recipes-to-sql.ts <lot.json> [foods.json]");
const lot: Lot = JSON.parse(readFileSync(lotPath, "utf8"));
const foods = new Map<number, Food>(
  foodsPath
    ? (JSON.parse(readFileSync(foodsPath, "utf8")) as Food[]).map((food) => [food.id, food])
    : [],
);

const sql = (value: string) => `'${value.replace(/'/g, "''")}'`;
const recipeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lines: string[] = [];

lines.push(
  `-- Recettes de base, lot ${lot.lot} : textes originaux écrits pour l'app.`,
  `-- Généré par scripts/base-recipes-to-sql.ts depuis scripts/base-recipes/lot${lot.lot}.json (la`,
  "-- source à modifier) : chaque ligne passe par ingredientFromFields, chaque aliment est relié à",
  "-- Ciqual. Ids fixes : relancer met à jour sans doublon (les copies pointent vers la recette).",
  "",
);

if (lot.unitWeights.length > 0) {
  lines.push(
    "-- Poids d'une pièce pour les aliments que ce lot compte (ordres de grandeur de cuisine).",
  );
  lines.push("update public.foods f set unit_weight_g = w.grams from (values");
  lines.push(
    lot.unitWeights
      .map(([id, grams, label], index) => {
        const comma = index < lot.unitWeights.length - 1 ? "," : "";
        return `  (${id}, ${grams})${comma} -- ${label}`;
      })
      .join("\n"),
  );
  lines.push(") as w(id, grams) where f.id = w.id;", "");
}

for (const recipe of lot.recipes) {
  const id = recipeId(recipe.n);
  const diets =
    recipe.diets.length === 0
      ? "'{}'"
      : `array[${recipe.diets.map(sql).join(", ")}]::public.recipe_diet[]`;
  lines.push(`-- ${recipe.title}`);
  lines.push(
    "insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)",
  );
  lines.push(`values (${sql(id)}, null, ${sql(recipe.title)}, ${recipe.servings}, array[`);
  lines.push(recipe.steps.map((step) => `  ${sql(step)}`).join(",\n"));
  const chefTip = recipe.chefTip ? sql(recipe.chefTip) : "null";
  lines.push(`], ${diets}, ${recipe.minutes}, ${recipe.budget}, ${chefTip})`);
  lines.push(
    "on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,",
    "  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,",
    "  chef_tip = excluded.chef_tip;",
  );
  if (recipe.chefTip && recipe.chefTip.length > 300) {
    throw new Error(
      `${recipe.title} : astuce de ${recipe.chefTip.length} caractères (300 au plus)`,
    );
  }
  lines.push(`delete from public.recipe_ingredients where recipe_id = ${sql(id)};`);
  lines.push(
    "insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values",
  );

  const parsed = recipe.ingredients.map(([name, quantity, foodId]) => ({
    ...ingredientFromFields(name, quantity),
    foodId,
  }));
  lines.push(
    parsed
      .map((line, position) => {
        const unit = line.unit === null ? "null" : `${sql(line.unit)}::public.ingredient_unit`;
        return `  (${sql(id)}, ${position}, ${sql(line.raw)}, ${sql(line.label)}, ${line.quantity ?? "null"}, ${unit}, ${line.foodId ?? "null"})`;
      })
      .join(",\n") + ";",
  );
  lines.push("");

  if (foods.size > 0) {
    const macros = macrosPerServing(
      parsed.map((line) => {
        const food = line.foodId === null ? undefined : foods.get(line.foodId);
        return {
          quantity: line.quantity,
          unit: line.unit,
          food: food
            ? {
                kcal: food.kcal,
                proteinG: food.protein_g,
                carbsG: food.carbs_g,
                fatG: food.fat_g,
                unitWeightG: food.unit_weight_g,
              }
            : null,
        };
      }),
      recipe.servings,
    );
    const missing = parsed.filter((line) => line.foodId !== null && !foods.has(line.foodId));
    console.error(
      `${recipe.n} ${recipe.title} : ${macros?.kcal} kcal/part, P ${macros?.proteinG} G ${macros?.carbsG} L ${macros?.fatG}, comptés ${macros?.counted}, non comptés ${macros?.uncounted}` +
        (missing.length > 0
          ? ` — aliments absents : ${missing.map((l) => l.foodId).join(", ")}`
          : ""),
    );
  }
}

process.stdout.write(lines.join("\n"));
