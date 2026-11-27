// Recettes (migration recipes) sur la base locale : le vrai code de src/lib/recipes.ts, RLS,
// droits par colonne, transaction de save_recipe, recettes de base, liens et photos.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice et Bea partagent un foyer, Dan a le sien et n'entre jamais dans celui d'Alice.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  copyBaseRecipe,
  deleteRecipe,
  fetchBaseRecipes,
  fetchCarnet,
  fetchCarnets,
  fetchCookedWinners,
  fetchRecipe,
  saveRecipe,
  searchFoods,
  type RecipeDraft,
} from "../../src/lib/recipes.ts";
import { fetchHome } from "../../src/lib/home.ts";
import {
  clearPhotoUrlCache,
  getPhotoUrl,
  RECIPE_BUCKET,
  removeRecipePhoto,
  removeRecipePhotoFile,
  uploadRecipePhoto,
} from "../../src/lib/photo-storage.ts";
import { macrosPerServing } from "../../src/lib/recipe-rules.ts";
import {
  addRecipeToShopping,
  fetchShoppingList,
  setShoppingItemChecked,
} from "../../src/lib/shopping.ts";
import { planShoppingAdditions } from "../../src/lib/shopping-rules.ts";
import { createSoiree } from "../../src/lib/soirees.ts";
import { addProposal, closeSession, fetchSession, startSession } from "../../src/lib/votes.ts";
import {
  cleanUp,
  createBaseRecipe,
  createFood,
  createGroup,
  createUser,
  deleteBaseRecipe,
  setBaseRecipeChefTip,
  recipePhotoExists,
  removeBaseRecipePhoto,
  setBaseRecipePhoto,
  signInAs,
  signInAsNewGuest,
  type TestUser,
} from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let dan: TestUser;
let foyerId: string;
let danFoyerId: string;
let baseId: string;

const FOOD_ID = 999001;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  dan = await createUser("Dan");
  foyerId = await createGroup(alice, [bea]);
  danFoyerId = await createGroup(dan, []);
  await createFood(FOOD_ID, "Bœuf, haché, 15 % MG, cru (test)");
  baseId = await createBaseRecipe("Pâtes au beurre (test)");
});

after(async () => {
  await deleteBaseRecipe(baseId);
  await cleanUp();
});

const bolo: RecipeDraft = {
  title: "  Bolognaise   maison ",
  servings: 4,
  steps: ["Faire revenir  l'oignon", "Ajouter la viande"],
  ingredients: [
    { raw: "500 g de bœuf haché", label: "bœuf haché", quantity: 500, unit: "g", foodId: FOOD_ID },
    { raw: "1 oignon", label: "oignon", quantity: 1, unit: null, foodId: null },
    { raw: "sel", label: "sel", quantity: null, unit: null, foodId: null },
  ],
  chefTip: null,
  category: null,
  diets: [],
  totalMinutes: null,
  budget: null,
};

describe("le carnet du foyer", () => {
  test("une recette écrite par Alice, lue par Bea, texte rangé et ingrédients dans l'ordre", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);

    await signInAs(bea);
    const recipe = await fetchRecipe(id);
    assert.equal(recipe.title, "Bolognaise maison");
    assert.deepEqual(recipe.steps, ["Faire revenir l'oignon", "Ajouter la viande"]);
    assert.deepEqual(
      recipe.ingredients.map((ingredient) => [
        ingredient.label,
        ingredient.quantity,
        ingredient.unit,
        ingredient.foodId,
      ]),
      [
        ["bœuf haché", 500, "g", FOOD_ID],
        ["oignon", 1, null, null],
        ["sel", null, null, null],
      ],
    );
    assert.ok((await fetchCarnet(foyerId)).some((summary) => summary.id === id));
  });

  test("Bea modifie la recette : tous les ingrédients sont remplacés", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);

    await signInAs(bea);
    await saveRecipe(foyerId, id, {
      ...bolo,
      servings: 6,
      ingredients: [
        { raw: "2 carottes", label: "carottes", quantity: 2, unit: null, foodId: null },
      ],
    });
    const recipe = await fetchRecipe(id);
    assert.equal(recipe.servings, 6);
    assert.deepEqual(
      recipe.ingredients.map((ingredient) => ingredient.label),
      ["carottes"],
    );
  });

  test("un enregistrement refusé ne laisse pas une recette à moitié écrite", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);

    // Une unité sans quantité est refusée : la transaction entière est annulée.
    await assert.rejects(
      saveRecipe(foyerId, id, {
        ...bolo,
        title: "Renommée",
        ingredients: [{ raw: "g de sel", label: "sel", quantity: null, unit: "g", foodId: null }],
      }),
    );
    const recipe = await fetchRecipe(id);
    assert.equal(recipe.title, "Bolognaise maison");
    assert.equal(recipe.ingredients.length, 3);
  });

  test("le serveur refuse ce qui sort des règles", async () => {
    await signInAs(alice);
    await assert.rejects(saveRecipe(foyerId, null, { ...bolo, servings: 0 }));
    await assert.rejects(saveRecipe(foyerId, null, { ...bolo, title: "   " }));
    await assert.rejects(saveRecipe(foyerId, null, { ...bolo, steps: [" "] }));
    const tooMany = Array.from({ length: 61 }, (_, index) => ({
      raw: `ingrédient ${index}`,
      label: `ingrédient ${index}`,
      quantity: null,
      unit: null,
      foodId: null,
    }));
    await assert.rejects(saveRecipe(foyerId, null, { ...bolo, ingredients: tooMany }));
  });

  test("ni le foyer, ni l'auteur d'une recette ne se changent depuis l'app", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);
    const moved = await supabase.from("recipes").update({ group_id: danFoyerId }).eq("id", id);
    assert.ok(moved.error, "group_id ne doit pas être modifiable");
    const author = await supabase.from("recipes").update({ created_by: bea.id }).eq("id", id);
    assert.ok(author.error, "created_by ne doit pas être modifiable");
  });
});

describe("hors du foyer", () => {
  test("Dan ne lit, n'écrit, ne modifie ni ne retire rien du carnet d'Alice", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);

    await signInAs(dan);
    await assert.rejects(fetchRecipe(id));
    assert.deepEqual(await fetchCarnet(foyerId), []);
    await assert.rejects(saveRecipe(foyerId, null, bolo));
    await assert.rejects(saveRecipe(foyerId, id, bolo));
    await assert.rejects(deleteRecipe(id));

    await signInAs(alice);
    assert.equal((await fetchRecipe(id)).title, "Bolognaise maison");
  });

  test("pas de recette dans un repas à plusieurs", async () => {
    await signInAs(alice);
    const meal = await createSoiree({ name: "Kebab", mode: "commande", topics: [], date: null });
    await assert.rejects(saveRecipe(meal.id, null, bolo));
  });
});

describe("les recettes de base", () => {
  test("lisibles par tous les comptes, modifiables par personne", async () => {
    await signInAs(dan);
    assert.ok((await fetchBaseRecipes()).some((summary) => summary.id === baseId));
    assert.equal((await fetchRecipe(baseId)).ingredients.length, 2);

    await assert.rejects(saveRecipe(danFoyerId, baseId, bolo));
    await assert.rejects(deleteRecipe(baseId));
    const { data } = await supabase
      .from("recipes")
      .update({ title: "Piratée" })
      .eq("id", baseId)
      .select("id");
    assert.deepEqual(data ?? [], []);
    assert.equal((await fetchRecipe(baseId)).title, "Pâtes au beurre (test)");
  });

  test("« Ajouter à mon carnet » : une copie modifiable, et une seule", async () => {
    await signInAs(alice);
    const copyId = await copyBaseRecipe(baseId, foyerId);
    const copy = await fetchRecipe(copyId);
    assert.equal(copy.groupId, foyerId);
    assert.equal(copy.sourceRecipeId, baseId);
    assert.deepEqual(
      copy.ingredients.map((ingredient) => ingredient.label),
      ["pâtes", "sel"],
    );
    assert.equal(await copyBaseRecipe(baseId, foyerId), copyId);

    await saveRecipe(foyerId, copyId, { ...bolo, title: "Pâtes de la maison" });
    assert.equal((await fetchRecipe(baseId)).title, "Pâtes au beurre (test)");
  });

  test("on ne copie que dans le carnet de son propre foyer", async () => {
    await signInAs(dan);
    await assert.rejects(copyBaseRecipe(baseId, foyerId));
  });
});

describe("d'où viennent une proposition et un article", () => {
  test("une recette du carnet se propose au vote et part aux courses ; celle d'un autre foyer non", async () => {
    await signInAs(dan);
    const danRecipeId = await saveRecipe(danFoyerId, null, bolo);

    await signInAs(alice);
    const recipeId = await saveRecipe(foyerId, null, bolo);
    const sessionId = await startSession(foyerId, "soir");

    const ok = await supabase.from("proposals").insert({
      session_id: sessionId,
      name: "Bolognaise maison",
      proposed_by: alice.id,
      recipe_id: recipeId,
    });
    assert.equal(ok.error, null);
    const foreign = await supabase.from("proposals").insert({
      session_id: sessionId,
      name: "Autre bolo",
      proposed_by: alice.id,
      recipe_id: danRecipeId,
    });
    assert.ok(foreign.error, "la recette d'un autre foyer doit être refusée");

    const item = await supabase
      .from("shopping_items")
      .insert({ group_id: foyerId, label: "Bœuf haché", recipe_id: recipeId });
    assert.equal(item.error, null);
    const foreignItem = await supabase
      .from("shopping_items")
      .insert({ group_id: foyerId, label: "Oignon", recipe_id: danRecipeId });
    assert.ok(foreignItem.error, "un article ne vient pas de la recette d'un autre foyer");
  });

  test("la recette retirée, la proposition garde son nom", async () => {
    // Un foyer neuf : celui d'Alice a déjà un vote ouvert (un seul par foyer).
    const otherFoyerId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const recipeId = await saveRecipe(otherFoyerId, null, { ...bolo, title: "Gratin (test)" });
    const sessionId = await startSession(otherFoyerId, "midi");
    await supabase.from("proposals").insert({
      session_id: sessionId,
      name: "Gratin (test)",
      proposed_by: alice.id,
      recipe_id: recipeId,
    });

    await deleteRecipe(recipeId);
    const { data } = await supabase
      .from("proposals")
      .select("name, recipe_id")
      .eq("session_id", sessionId)
      .single();
    assert.deepEqual(data, { name: "Gratin (test)", recipe_id: null });
  });
});

describe("les photos des recettes", () => {
  const photo = () => new Uint8Array(2048).fill(7);
  const path = (groupId: string) => `${groupId}/${crypto.randomUUID()}.jpg`;

  test("le foyer envoie et voit les photos de son carnet ; Dan non", async () => {
    await signInAs(alice);
    const photoPath = path(foyerId);
    const upload = await supabase.storage
      .from("recipe-photos")
      .upload(photoPath, photo(), { contentType: "image/jpeg" });
    assert.equal(upload.error, null);
    const id = await saveRecipe(foyerId, null, bolo);
    const saved = await supabase.from("recipes").update({ photo_path: photoPath }).eq("id", id);
    assert.equal(saved.error, null);

    await signInAs(bea);
    const link = await supabase.storage.from("recipe-photos").createSignedUrl(photoPath, 60);
    assert.equal(link.error, null);

    await signInAs(dan);
    const stolen = await supabase.storage.from("recipe-photos").createSignedUrl(photoPath, 60);
    assert.ok(stolen.error, "Dan ne doit pas voir la photo");
    const intrusion = await supabase.storage
      .from("recipe-photos")
      .upload(path(foyerId), photo(), { contentType: "image/jpeg" });
    assert.ok(intrusion.error, "Dan ne doit pas envoyer dans le dossier d'Alice");
  });

  test("une recette ne pointe jamais vers la photo d'un autre foyer", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);
    const { error } = await supabase
      .from("recipes")
      .update({ photo_path: path(danFoyerId) })
      .eq("id", id);
    assert.ok(error, "le chemin doit commencer par le dossier du foyer");
  });
});

describe("le type de plat et les régimes", () => {
  test("choisis à l'écriture, modifiés puis retirés, lus par tout le foyer", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, {
      ...bolo,
      category: "viande",
      diets: ["sans_gluten"],
    });

    await signInAs(bea);
    const saved = await fetchRecipe(id);
    assert.equal(saved.category, "viande");
    assert.deepEqual(saved.diets, ["sans_gluten"]);
    // Le carnet les a aussi : le badge et les filtres s'en servent.
    const summary = (await fetchCarnet(foyerId)).find((recipe) => recipe.id === id);
    assert.equal(summary?.category, "viande");

    await saveRecipe(foyerId, id, {
      ...bolo,
      category: "vege",
      diets: ["vegetarien", "sans_porc"],
    });
    const changed = await fetchRecipe(id);
    assert.equal(changed.category, "vege");
    assert.deepEqual(changed.diets, ["vegetarien", "sans_porc"]);

    // Sans type ni régime : tout est retiré.
    await saveRecipe(foyerId, id, bolo);
    const cleared = await fetchRecipe(id);
    assert.equal(cleared.category, null);
    assert.deepEqual(cleared.diets, []);
  });

  test("les 20 recettes de base ont un type, et la copie le garde", async () => {
    await signInAs(alice);
    const bases = (await fetchBaseRecipes()).filter((recipe) =>
      /^00000000-0000-4000-8000-0000000000(0[1-9]|1[0-9]|20)$/.test(recipe.id),
    );
    assert.equal(bases.length, 20);
    assert.ok(bases.every((recipe) => recipe.category !== null));

    const groupId = await createGroup(alice, []);
    const copy = await fetchRecipe(
      await copyBaseRecipe("00000000-0000-4000-8000-000000000019", groupId),
    );
    assert.equal(copy.category, "poisson");
  });
});

describe("le temps et le budget", () => {
  test("écrits, modifiés puis effacés ; une version de l'app qui ne les envoie pas les garde", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, { ...bolo, totalMinutes: 25, budget: 1 });
    const saved = await fetchRecipe(id);
    assert.equal(saved.totalMinutes, 25);
    assert.equal(saved.budget, 1);

    await saveRecipe(foyerId, id, { ...bolo, totalMinutes: 90, budget: 3 });
    assert.equal((await fetchRecipe(id)).totalMinutes, 90);

    // Une version de l'app d'avant ces champs : l'appel sans eux ne les efface pas.
    const old = await supabase.rpc("save_recipe", {
      target_group_id: foyerId,
      target_recipe_id: id,
      recipe_title: "Bolognaise maison",
      recipe_servings: 4,
      recipe_steps: [],
      ingredients: [],
    });
    assert.equal(old.error, null);
    const kept = await fetchRecipe(id);
    assert.equal(kept.totalMinutes, 90);
    assert.equal(kept.budget, 3);

    // Champs vidés dans le formulaire : effacés.
    await saveRecipe(foyerId, id, bolo);
    const cleared = await fetchRecipe(id);
    assert.equal(cleared.totalMinutes, null);
    assert.equal(cleared.budget, null);
  });
});

describe("l'astuce du chef", () => {
  test("écrite, modifiée puis effacée par le foyer, lue par tous ses membres", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, { ...bolo, chefTip: "  Laisse   mijoter. " });

    await signInAs(bea);
    assert.equal((await fetchRecipe(id)).chefTip, "Laisse mijoter.");
    await saveRecipe(foyerId, id, { ...bolo, chefTip: "Un trait de vin rouge." });
    assert.equal((await fetchRecipe(id)).chefTip, "Un trait de vin rouge.");
    // Enregistrer sans astuce l'efface (le champ vidé dans « Écrire une recette »).
    await saveRecipe(foyerId, id, bolo);
    assert.equal((await fetchRecipe(id)).chefTip, null);
  });

  test("la copie d'une recette de base garde son astuce", async () => {
    const tipBaseId = await createBaseRecipe("Riz au lait (test)");
    try {
      await setBaseRecipeChefTip(tipBaseId, "Remue souvent, le riz attache.");
      const groupId = await createGroup(alice, [bea]);
      await signInAs(alice);
      assert.equal((await fetchRecipe(tipBaseId)).chefTip, "Remue souvent, le riz attache.");
      const copy = await fetchRecipe(await copyBaseRecipe(tipBaseId, groupId));
      assert.equal(copy.chefTip, "Remue souvent, le riz attache.");
    } finally {
      await deleteBaseRecipe(tipBaseId);
    }
  });

  test("la base refuse une astuce vide ou de plus de 300 caractères", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);
    const blank = await supabase.from("recipes").update({ chef_tip: "   " }).eq("id", id);
    assert.equal(blank.error?.code, "23514");
    const long = await supabase
      .from("recipes")
      .update({ chef_tip: "a".repeat(301) })
      .eq("id", id);
    assert.equal(long.error?.code, "22001");
  });
});

describe("les photos des recettes de base", () => {
  let photoBaseId: string;
  let basePath: string;
  const photo = () => new Uint8Array(2048).fill(7);

  before(async () => {
    photoBaseId = await createBaseRecipe("Riz cantonais (test)");
    basePath = await setBaseRecipePhoto(photoBaseId);
  });

  after(async () => {
    await deleteBaseRecipe(photoBaseId);
    await removeBaseRecipePhoto(basePath);
  });

  test("visible par tous les comptes, même sans foyer commun ; pas par un invité", async () => {
    await signInAs(dan);
    clearPhotoUrlCache();
    const base = (await fetchBaseRecipes()).find((summary) => summary.id === photoBaseId);
    assert.equal(base?.photoPath, basePath);
    const url = await getPhotoUrl(basePath, RECIPE_BUCKET);
    assert.ok(url, "Dan voit la photo d'une recette de base");
    assert.equal((await fetch(url)).status, 200);

    await signInAsNewGuest();
    const guest = await supabase.storage.from(RECIPE_BUCKET).createSignedUrl(basePath, 60);
    assert.ok(guest.error, "un invité anonyme ne voit pas les recettes de base");
  });

  test("personne n'envoie, ne remplace ni n'efface une photo de base depuis l'app", async () => {
    await signInAs(alice);
    const bucket = supabase.storage.from(RECIPE_BUCKET);
    const sent = await bucket.upload(`base/${crypto.randomUUID()}.jpg`, photo(), {
      contentType: "image/jpeg",
    });
    assert.ok(sent.error, "envoi dans base/");
    const replaced = await bucket.upload(basePath, photo(), {
      contentType: "image/jpeg",
      upsert: true,
    });
    assert.ok(replaced.error, "remplacement de la photo de base");
    await bucket.remove([basePath]);
    assert.equal(await recipePhotoExists(basePath), true, "la photo de base est toujours là");
  });

  test("la copie garde la photo ; la changer ou la retirer laisse l'originale", async () => {
    const groupId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const copyId = await copyBaseRecipe(photoBaseId, groupId);
    assert.equal((await fetchRecipe(copyId)).photoPath, basePath);

    const own = await uploadRecipePhoto(groupId, copyId, photo(), basePath);
    assert.match(own, new RegExp(`^${groupId}/`));
    assert.equal(await recipePhotoExists(basePath), true, "après le changement");

    await removeRecipePhoto(copyId, own);
    assert.equal((await fetchRecipe(copyId)).photoPath, null);

    // Retour à la photo de base (c'est elle que pointe une nouvelle copie), puis retrait de la
    // recette : le fichier de base ne bouge pas.
    const back = await supabase.from("recipes").update({ photo_path: basePath }).eq("id", copyId);
    assert.equal(back.error, null);
    await deleteRecipe(copyId);
    await removeRecipePhotoFile(basePath);
    assert.equal(await recipePhotoExists(basePath), true, "après le retrait de la copie");
  });

  test("une recette écrite par le foyer ne pointe pas vers base/", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);
    const { error } = await supabase.from("recipes").update({ photo_path: basePath }).eq("id", id);
    assert.equal(error?.code, "23514");
  });
});

describe("ce que lisent les écrans", () => {
  test("l'aliment Ciqual arrive avec sa ligne : les macros se calculent", async () => {
    await signInAs(alice);
    const id = await saveRecipe(foyerId, null, bolo);

    await signInAs(bea);
    const recipe = await fetchRecipe(id);
    assert.deepEqual(recipe.ingredients[0].food, {
      kcal: 250,
      proteinG: 20,
      carbsG: 0,
      fatG: 18,
      unitWeightG: null,
    });
    assert.equal(recipe.ingredients[1].food, null);
    // 500 g à 250 kcal pour 100 g, en 4 parts ; l'oignon et le sel ne comptent pas.
    assert.deepEqual(macrosPerServing(recipe.ingredients, recipe.servings), {
      kcal: 313,
      proteinG: 25,
      carbsG: 0,
      fatG: 23,
      counted: 1,
      // L'oignon (une pièce sans aliment) ; le sel, sans quantité, ne compte pas.
      uncounted: 1,
    });
  });

  test("le carnet compte les ingrédients, l'accueil et le choix comptent les recettes", async () => {
    const groupId = await createGroup(alice, [bea]);
    await signInAs(alice);
    await saveRecipe(groupId, null, bolo);
    await saveRecipe(groupId, null, { ...bolo, title: "Bolognaise du dimanche" });

    await signInAs(bea);
    const carnet = await fetchCarnet(groupId);
    assert.deepEqual(
      carnet.map((summary) => summary.ingredientCount),
      [3, 3],
    );
    assert.equal((await fetchHome()).recipesByGroup.get(groupId), 2);
    const carnets = await fetchCarnets();
    assert.equal(carnets.find((summary) => summary.groupId === groupId)?.recipeCount, 2);

    // Dan ne voit ni le carnet ni son compteur.
    await signInAs(dan);
    assert.equal((await fetchHome()).recipesByGroup.get(groupId), undefined);
    assert.ok(!(await fetchCarnets()).some((summary) => summary.groupId === groupId));
  });
});

describe("les aliments Ciqual", () => {
  test("la table est importée : la carotte crue a ses valeurs pour 100 g", async () => {
    await signInAs(alice);
    const { data, error } = await supabase
      .from("foods")
      .select("name, kcal, protein_g, carbs_g, fat_g")
      .eq("id", 20009)
      .single();
    assert.equal(error, null);
    assert.deepEqual(data, {
      name: "Carotte, crue",
      kcal: 30.2,
      protein_g: 0.78,
      carbs_g: 5.16,
      fat_g: 0,
    });
  });

  test("une pièce a son poids moyen : 3 œufs comptent dans les calories", async () => {
    await signInAs(alice);
    const { data, error } = await supabase
      .from("foods")
      .select("unit_weight_g")
      .eq("id", 22000)
      .single();
    assert.equal(error, null);
    assert.equal(data.unit_weight_g, 50);
  });

  test("chercher sans accents ni majuscules, ce qui commence par le texte d'abord", async () => {
    await signInAs(alice);
    const carrots = await searchFoods("CAROTTE");
    assert.ok(carrots.length > 0 && carrots.length <= 8);
    assert.ok(carrots[0].name.toLowerCase().startsWith("carotte"), carrots[0].name);
    assert.ok(carrots.every((food) => food.name.toLowerCase().includes("carotte")));

    // Ciqual écrit « Oeuf » ; un téléphone propose « Œuf ».
    const eggs = await searchFoods("Œuf");
    assert.ok(
      eggs.some((food) => food.name.startsWith("Oeuf")),
      "« Œuf » trouve « Oeuf »",
    );
    const creams = await searchFoods("creme");
    assert.ok(
      creams.some((food) => food.name.includes("Crème")),
      "« creme » trouve « Crème »",
    );

    // Un mot entier passe avant un morceau de mot : « oeuf » avant « boeuf », « sel » avant
    // « Selles-sur-Cher ».
    const eggFirst = await searchFoods("oeuf");
    assert.ok(eggFirst[0].name.startsWith("Oeuf"), eggFirst[0].name);
    const salt = await searchFoods("sel");
    assert.ok(salt[0].name.startsWith("Sel"), salt[0].name);
    assert.ok(
      salt.findIndex((food) => food.name.startsWith("Selles")) === -1 ||
        salt.findIndex((food) => food.name.startsWith("Selles")) > 0,
    );
    // Mot par mot : « pomme terre crue » trouve « Pomme de terre, sans peau, crue ».
    const potatoes = await searchFoods("pomme terre crue");
    assert.ok(potatoes.some((food) => food.name.startsWith("Pomme de terre")));

    // Trop court, ou des jokers tapés : rien d'inattendu.
    assert.deepEqual(await searchFoods("c"), []);
    assert.deepEqual(await searchFoods("%%"), []);
  });
});

describe("souvent cuisiné", () => {
  test("une recette qui gagne un vote clos compte comme cuisinée, pour le foyer seulement", async () => {
    // Un foyer neuf : un seul vote ouvert par foyer.
    const groupId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const recipeId = await saveRecipe(groupId, null, { ...bolo, title: "Pot-au-feu (test)" });
    const sessionId = await startSession(groupId, "soir");
    const proposal = await supabase.from("proposals").insert({
      session_id: sessionId,
      name: "Pot-au-feu",
      proposed_by: alice.id,
      recipe_id: recipeId,
    });
    assert.equal(proposal.error, null);
    // Seule proposition : elle gagne au tirage, sans vote.
    await closeSession(sessionId);

    await signInAs(bea);
    assert.deepEqual(await fetchCookedWinners(groupId), [recipeId]);

    await signInAs(dan);
    assert.deepEqual(await fetchCookedWinners(groupId), []);
  });
});

describe("la photo d'une recette, par l'app", () => {
  const jpeg = () => new Uint8Array(2048).fill(9);
  const exists = async (path: string) => {
    const [folder, file] = path.split("/");
    const { data } = await supabase.storage.from(RECIPE_BUCKET).list(folder, { search: file });
    return (data ?? []).some((entry) => entry.name === file);
  };

  test("envoyer, remplacer (l'ancienne disparaît), retirer", async () => {
    await signInAs(alice);
    const recipeId = await saveRecipe(foyerId, null, { ...bolo, title: "Photo (test)" });

    const first = await uploadRecipePhoto(foyerId, recipeId, jpeg(), null);
    assert.ok(first.startsWith(`${foyerId}/`));
    assert.equal((await fetchRecipe(recipeId)).photoPath, first);

    const second = await uploadRecipePhoto(foyerId, recipeId, jpeg(), first);
    assert.equal((await fetchRecipe(recipeId)).photoPath, second);
    assert.equal(await exists(first), false, "l'ancienne photo est supprimée");

    await signInAs(bea);
    assert.equal(await exists(second), true, "le foyer voit la photo");

    await removeRecipePhoto(recipeId, second);
    assert.equal((await fetchRecipe(recipeId)).photoPath, null);
    assert.equal(await exists(second), false);
  });
});

describe("ajouter une recette aux courses", () => {
  test("les nouveaux arrivent avec leur recette, le pris revient, le déjà à acheter n'est pas doublé", async () => {
    const groupId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const recipeId = await saveRecipe(groupId, null, { ...bolo, title: "Courses (test)" });
    // Comme l'app : on ajoute, puis on coche (checked_at n'est pas modifiable à l'insertion,
    // l'heure et l'auteur d'une coche viennent du serveur).
    const taken = await supabase
      .from("shopping_items")
      .insert({ group_id: groupId, label: "Oignon" })
      .select("id")
      .single();
    assert.equal(taken.error, null);
    await setShoppingItemChecked(taken.data?.id ?? "", true);
    await supabase.from("shopping_items").insert({ group_id: groupId, label: "Sel" });

    await signInAs(bea);
    const plan = planShoppingAdditions(
      [
        { label: "Bœuf haché", quantity: "250 g" },
        { label: "oignon", quantity: "1" },
        { label: "Sel", quantity: null },
      ],
      await fetchShoppingList(groupId),
    );
    assert.equal(await addRecipeToShopping(groupId, recipeId, plan), 2);

    const list = await fetchShoppingList(groupId);
    const beef = list.find((item) => item.label === "Bœuf haché");
    assert.equal(beef?.quantity, "250 g");
    assert.equal(list.filter((item) => item.label === "Sel").length, 1);
    assert.equal(list.find((item) => item.id === taken.data?.id)?.checkedAt, null);
    const origin = await supabase
      .from("shopping_items")
      .select("recipe_id")
      .eq("group_id", groupId)
      .eq("label", "Bœuf haché")
      .single();
    assert.equal(origin.data?.recipe_id, recipeId);
  });
});

describe("le carnet dans le vote", () => {
  test("une recette proposée garde son lien jusqu'au résultat ; celle d'un autre foyer est refusée", async () => {
    await signInAs(dan);
    const danRecipeId = await saveRecipe(danFoyerId, null, { ...bolo, title: "Chez Dan (test)" });

    const groupId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const recipeId = await saveRecipe(groupId, null, { ...bolo, title: "Gratin (vote test)" });
    const sessionId = await startSession(groupId, "soir");
    assert.equal(await addProposal(sessionId, "Gratin (vote test)", recipeId), true);
    await assert.rejects(addProposal(sessionId, "Chez Dan", danRecipeId));
    // Un plat tapé sans recette reste possible.
    assert.equal(await addProposal(sessionId, "Pizza"), true);

    await closeSession(sessionId);
    await signInAs(bea);
    const session = await fetchSession(sessionId);
    const gratin = session.proposals.find((proposal) => proposal.name === "Gratin (vote test)");
    assert.equal(gratin?.recipeId, recipeId);
    assert.equal(session.proposals.find((proposal) => proposal.name === "Pizza")?.recipeId, null);
  });
});

describe("les recettes de base, lot 2", () => {
  test("7 photos dans base/<id>.jpg ; velouté, wok et cabillaud sans photo", async () => {
    await signInAs(alice);
    const withoutPhoto = new Set([15, 18, 19]);
    const lot2 = (await fetchBaseRecipes()).filter((recipe) =>
      /^00000000-0000-4000-8000-0000000000(1[1-9]|20)$/.test(recipe.id),
    );
    assert.equal(lot2.length, 10);
    for (const recipe of lot2) {
      const n = Number(recipe.id.slice(-2));
      const expected = withoutPhoto.has(n) ? null : `base/${recipe.id}.jpg`;
      assert.equal(recipe.photoPath, expected, recipe.title);
    }
  });

  test("10 recettes avec leur astuce, chaque ligne reliée à Ciqual ; un poulet compte sa part mangée", async () => {
    await signInAs(alice);
    const lot2 = (await fetchBaseRecipes()).filter((recipe) =>
      /^00000000-0000-4000-8000-0000000000(1[1-9]|20)$/.test(recipe.id),
    );
    assert.equal(lot2.length, 10);
    for (const summary of lot2) {
      const recipe = await fetchRecipe(summary.id);
      assert.ok(
        recipe.ingredients.every((line) => line.food !== null),
        `${recipe.title} : chaque ligne a son aliment`,
      );
      assert.ok(recipe.chefTip, `${recipe.title} : une astuce du chef`);
    }

    const chili = await fetchRecipe("00000000-0000-4000-8000-000000000013");
    assert.ok(chili.diets.includes("vegan"));
    // 1 poulet = 1 000 g mangés (pas 1,5 kg avec la carcasse) : moins de 800 kcal la part.
    const poulet = await fetchRecipe("00000000-0000-4000-8000-000000000014");
    const macros = macrosPerServing(poulet.ingredients, poulet.servings);
    assert.ok(macros && macros.kcal > 600 && macros.kcal < 800, `${macros?.kcal} kcal`);
  });
});

describe("les recettes de base, lot 1", () => {
  test("chaque recette a son astuce du chef", async () => {
    await signInAs(alice);
    for (let n = 1; n <= 10; n += 1) {
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const recipe = await fetchRecipe(id);
      assert.ok(recipe.chefTip && recipe.chefTip.length <= 300, recipe.title);
    }
  });

  test("9 photos dans base/<id>.jpg ; la blanquette sans photo", async () => {
    await signInAs(alice);
    const lot1 = (await fetchBaseRecipes()).filter((recipe) =>
      /^00000000-0000-4000-8000-0000000000(0[1-9]|10)$/.test(recipe.id),
    );
    assert.equal(lot1.length, 10);
    for (const recipe of lot1) {
      const expected = recipe.title === "Blanquette de veau" ? null : `base/${recipe.id}.jpg`;
      assert.equal(recipe.photoPath, expected, recipe.title);
    }
  });

  test("lisibles avec leurs étiquettes, et la copie dans un carnet les garde", async () => {
    await signInAs(alice);
    const base = await fetchBaseRecipes();
    const dahl = base.find((recipe) => recipe.title === "Dahl de lentilles corail");
    assert.ok(dahl, "le dahl est une recette de base");
    assert.ok(base.filter((recipe) => recipe.id.startsWith("00000000-")).length >= 10);

    const recipe = await fetchRecipe(dahl.id);
    assert.deepEqual(recipe.diets.slice().sort(), [
      "sans_gluten",
      "sans_lactose",
      "sans_porc",
      "vegan",
      "vegetarien",
    ]);
    assert.equal(recipe.totalMinutes, 35);
    assert.equal(recipe.budget, 1);
    assert.ok(
      recipe.ingredients.every((line) => line.food !== null),
      "chaque ligne a son aliment",
    );

    const groupId = await createGroup(alice, [bea]);
    await signInAs(alice);
    const copy = await fetchRecipe(await copyBaseRecipe(dahl.id, groupId));
    assert.deepEqual(copy.diets, recipe.diets);
    assert.equal(copy.totalMinutes, 35);
    assert.equal(copy.ingredients.length, recipe.ingredients.length);
  });
});
