// Recettes (migration recipes) : le carnet d'un foyer, les recettes de base, une recette et
// ses ingrédients, enregistrer, copier, retirer, suivre en direct. Les règles d'accès sont
// dans la base (RLS : membres du foyer ; recettes de base en lecture seule).
import type { FoodNutrients, IngredientUnit, RecipeCategory, RecipeDiet } from "./recipe-rules";
import { supabase } from "./supabase";

export type { IngredientUnit };

// Une ligne d'ingrédient, comme l'écran l'envoie et la lit.
export type RecipeIngredient = {
  // La ligne telle qu'écrite (« 500 g de bœuf haché »).
  raw: string;
  // Ce que l'app en a lu : le nom (« bœuf haché »), la quantité et l'unité si elles sont chiffrées.
  label: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  // L'aliment Ciqual choisi à l'autocomplétion ; null = texte libre, pas compté dans les macros.
  foodId: number | null;
};

// Une ligne lue avec son aliment Ciqual (valeurs pour 100 g) : les calories et les macros
// de l'écran de la recette en viennent.
export type RecipeIngredientView = RecipeIngredient & { food: FoodNutrients | null };

// Une recette dans une liste (carnet, recettes de base).
export type RecipeSummary = {
  id: string;
  title: string;
  servings: number;
  ingredientCount: number;
  photoPath: string | null;
  // La recette de base dont elle est la copie, null sinon.
  sourceRecipeId: string | null;
  updatedAt: string;
  // Étiquettes posées à l'écriture : le badge de la vignette et les filtres du carnet.
  category: RecipeCategory | null;
  diets: RecipeDiet[];
  totalMinutes: number | null;
  budget: number | null;
};

export type Recipe = RecipeSummary & {
  // null : une recette de base (lecture seule).
  groupId: string | null;
  steps: string[];
  ingredients: RecipeIngredientView[];
  // L'astuce du chef (encadré du chat cuisinier), null sans astuce.
  chefTip: string | null;
};

// Ce que l'écran « Écrire une recette » envoie : tout d'un coup.
export type RecipeDraft = {
  title: string;
  servings: number;
  steps: string[];
  ingredients: RecipeIngredient[];
  chefTip: string | null;
  category: RecipeCategory | null;
  diets: RecipeDiet[];
  totalMinutes: number | null;
  budget: number | null;
};

const RECIPE_COLUMNS =
  "id, title, servings, photo_path, source_recipe_id, updated_at, category, diets, total_minutes, budget";
// Les listes comptent les ingrédients sans les lire. Jamais dans fetchRecipe : son tri des
// ingrédients (par position) s'appliquerait aussi à ce compte, et Postgres le refuse (42803).
const SUMMARY_COLUMNS = `${RECIPE_COLUMNS}, ingredient_count:recipe_ingredients(count)`;

type RecipeRow = {
  id: string;
  title: string;
  servings: number;
  photo_path: string | null;
  source_recipe_id: string | null;
  updated_at: string;
  category: RecipeCategory | null;
  diets: RecipeDiet[];
  total_minutes: number | null;
  budget: number | null;
};

function toSummary(row: RecipeRow, ingredientCount: number): RecipeSummary {
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    ingredientCount,
    photoPath: row.photo_path,
    sourceRecipeId: row.source_recipe_id,
    updatedAt: row.updated_at,
    category: row.category,
    diets: row.diets,
    totalMinutes: row.total_minutes,
    budget: row.budget,
  };
}

// Le carnet d'un foyer, par ordre alphabétique (« Souvent cuisiné » viendra avec les écrans).
export async function fetchCarnet(groupId: string): Promise<RecipeSummary[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(SUMMARY_COLUMNS)
    .eq("group_id", groupId)
    .order("title");
  if (error) throw error;
  return data.map((row) => toSummary(row, row.ingredient_count.at(0)?.count ?? 0));
}

// Les recettes de base, écrites pour l'app : on les copie dans son carnet.
export async function fetchBaseRecipes(): Promise<RecipeSummary[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(SUMMARY_COLUMNS)
    .is("group_id", null)
    .order("title");
  if (error) throw error;
  return data.map((row) => toSummary(row, row.ingredient_count.at(0)?.count ?? 0));
}

// Une recette et ses ingrédients dans l'ordre. single : absente ou cachée par la RLS (un
// autre foyer) lève une erreur.
export async function fetchRecipe(recipeId: string): Promise<Recipe> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `${RECIPE_COLUMNS}, group_id, steps, chef_tip,
      recipe_ingredients(position, raw, label, quantity, unit, food_id,
        food:foods(kcal, protein_g, carbs_g, fat_g, unit_weight_g))`,
    )
    .eq("id", recipeId)
    .order("position", { referencedTable: "recipe_ingredients" })
    .single();
  if (error) throw error;
  return {
    ...toSummary(data, data.recipe_ingredients.length),
    groupId: data.group_id,
    steps: data.steps,
    chefTip: data.chef_tip,
    ingredients: data.recipe_ingredients.map((row) => ({
      raw: row.raw,
      label: row.label,
      quantity: row.quantity,
      unit: row.unit,
      foodId: row.food_id,
      food: row.food
        ? {
            kcal: row.food.kcal,
            proteinG: row.food.protein_g,
            carbsG: row.food.carbs_g,
            fatG: row.food.fat_g,
            unitWeightG: row.food.unit_weight_g,
          }
        : null,
    })),
  };
}

// Les recettes gagnantes des derniers votes clos du foyer, du plus récent au plus ancien (null :
// un plat sans recette) : « Souvent cuisiné » les compte (oftenCooked).
export async function fetchCookedWinners(groupId: string): Promise<(string | null)[]> {
  const { data, error } = await supabase
    .from("vote_sessions")
    .select("winner:proposals!vote_sessions_winner_fk(recipe_id)")
    .eq("group_id", groupId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map((session) => session.winner?.recipe_id ?? null);
}

// Un aliment Ciqual proposé pendant qu'on tape un ingrédient.
export type FoodSuggestion = { id: number; name: string; groupName: string | null };

// Les 8 aliments dont le nom contient ce qu'on tape, sans accents ni majuscules (search_foods).
// Moins de 2 lettres : rien, sans appel au serveur.
export async function searchFoods(query: string): Promise<FoodSuggestion[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc("search_foods", { query });
  if (error) throw error;
  return data.map((food) => ({ id: food.id, name: food.name, groupName: food.group_name }));
}

// Un carnet par foyer, avec son nombre de recettes : l'écran de choix, quand on a plusieurs
// foyers (la RLS ne montre que les siens).
export type CarnetSummary = { groupId: string; name: string; recipeCount: number };

export async function fetchCarnets(): Promise<CarnetSummary[]> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, recipes(count)")
    .eq("kind", "foyer")
    .order("created_at");
  if (error) throw error;
  return data.map((group) => ({
    groupId: group.id,
    name: group.name,
    recipeCount: group.recipes.at(0)?.count ?? 0,
  }));
}

// Crée (recipeId null) ou remplace une recette et tous ses ingrédients, en une transaction
// (save_recipe). Renvoie l'identifiant de la recette.
export async function saveRecipe(
  groupId: string,
  recipeId: string | null,
  draft: RecipeDraft,
): Promise<string> {
  const { data, error } = await supabase.rpc("save_recipe", {
    target_group_id: groupId,
    recipe_title: draft.title,
    recipe_servings: draft.servings,
    recipe_steps: draft.steps,
    ingredients: draft.ingredients.map((ingredient) => ({
      raw: ingredient.raw,
      label: ingredient.label,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      food_id: ingredient.foodId,
    })),
    ...(recipeId ? { target_recipe_id: recipeId } : {}),
    // Absent = null pour la base : enregistrer sans astuce efface celle qu'il y avait.
    ...(draft.chefTip ? { recipe_chef_tip: draft.chefTip } : {}),
    // Absent = pas de type ; les régimes sont toujours envoyés (un tableau vide les efface).
    ...(draft.category ? { recipe_category: draft.category } : {}),
    recipe_diets: draft.diets,
    // 0 = effacer (champ vidé) ; null resterait la valeur d'avant.
    recipe_total_minutes: draft.totalMinutes ?? 0,
    recipe_budget: draft.budget ?? 0,
  });
  if (error) throw error;
  return data;
}

// « Ajouter à mon carnet » : la copie d'une recette de base (déjà copiée : la même copie).
export async function copyBaseRecipe(baseRecipeId: string, groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc("copy_base_recipe", {
    base_recipe_id: baseRecipeId,
    target_group_id: groupId,
  });
  if (error) throw error;
  return data;
}

// La RLS refuse sans erreur (0 ligne) : on le vérifie pour ne pas annoncer un faux retrait.
export async function deleteRecipe(recipeId: string): Promise<void> {
  const { data, error } = await supabase.from("recipes").delete().eq("id", recipeId).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("recipe_not_deleted");
}

const RELOAD_DELAY_MS = 300;

// Le carnet d'un foyer bouge en direct (une recette ajoutée, modifiée, retirée par un autre
// membre). Rechargement à chaque (re)connexion confirmée, comme la liste de courses.
// Renvoie la fonction de désabonnement.
export function subscribeToCarnet(groupId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function scheduleReload() {
    clearTimeout(timer);
    timer = setTimeout(onChange, RELOAD_DELAY_MS);
  }

  const channel = supabase
    .channel(`carnet:${groupId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "recipes", filter: `group_id=eq.${groupId}` },
      scheduleReload,
    )
    // Avec la RLS, un DELETE ne transporte que la clé primaire : pas de filtre possible.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "recipes" }, scheduleReload)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleReload();
    });

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
