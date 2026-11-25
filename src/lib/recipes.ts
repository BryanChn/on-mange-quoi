// Recettes (migration recipes) : le carnet d'un foyer, les recettes de base, une recette et
// ses ingrédients, enregistrer, copier, retirer, suivre en direct. Les règles d'accès sont
// dans la base (RLS : membres du foyer ; recettes de base en lecture seule).
import type { Enums } from "./database.types";
import { supabase } from "./supabase";

export type IngredientUnit = Enums<"ingredient_unit">;

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

// Une recette dans une liste (carnet, recettes de base).
export type RecipeSummary = {
  id: string;
  title: string;
  servings: number;
  photoPath: string | null;
  // La recette de base dont elle est la copie, null sinon.
  sourceRecipeId: string | null;
  updatedAt: string;
};

export type Recipe = RecipeSummary & {
  // null : une recette de base (lecture seule).
  groupId: string | null;
  steps: string[];
  ingredients: RecipeIngredient[];
};

// Ce que l'écran « Écrire une recette » envoie : tout d'un coup.
export type RecipeDraft = {
  title: string;
  servings: number;
  steps: string[];
  ingredients: RecipeIngredient[];
};

const SUMMARY_COLUMNS = "id, title, servings, photo_path, source_recipe_id, updated_at";

type SummaryRow = {
  id: string;
  title: string;
  servings: number;
  photo_path: string | null;
  source_recipe_id: string | null;
  updated_at: string;
};

function toSummary(row: SummaryRow): RecipeSummary {
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    photoPath: row.photo_path,
    sourceRecipeId: row.source_recipe_id,
    updatedAt: row.updated_at,
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
  return data.map(toSummary);
}

// Les recettes de base, écrites pour l'app : on les copie dans son carnet.
export async function fetchBaseRecipes(): Promise<RecipeSummary[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(SUMMARY_COLUMNS)
    .is("group_id", null)
    .order("title");
  if (error) throw error;
  return data.map(toSummary);
}

// Une recette et ses ingrédients dans l'ordre. single : absente ou cachée par la RLS (un
// autre foyer) lève une erreur.
export async function fetchRecipe(recipeId: string): Promise<Recipe> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `${SUMMARY_COLUMNS}, group_id, steps,
      recipe_ingredients(position, raw, label, quantity, unit, food_id)`,
    )
    .eq("id", recipeId)
    .order("position", { referencedTable: "recipe_ingredients" })
    .single();
  if (error) throw error;
  return {
    ...toSummary(data),
    groupId: data.group_id,
    steps: data.steps,
    ingredients: data.recipe_ingredients.map((row) => ({
      raw: row.raw,
      label: row.label,
      quantity: row.quantity,
      unit: row.unit,
      foodId: row.food_id,
    })),
  };
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
