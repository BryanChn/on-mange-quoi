import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import { CategoryIcon } from "@/components/category-icon";
import { ServingsStepper } from "@/components/servings-stepper";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { RecipeBanner } from "@/components/recipe-tile";
import { hapticAdded, hapticReject, hapticTick } from "@/lib/haptics";
import { pickRecipePhoto, type PhotoSource } from "@/lib/photo-picker";
import { removeRecipePhoto, removeRecipePhotoFile, uploadRecipePhoto } from "@/lib/photo-storage";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import {
  buildRecipeDraft,
  fieldsFromIngredient,
  INGREDIENT_LABEL_MAX_LENGTH,
  INGREDIENT_QUANTITY_MAX_LENGTH,
  RECIPE_CHEF_TIP_MAX_LENGTH,
  RECIPE_STEP_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
  BUDGET_LABELS,
  CATEGORY_LABELS,
  DIET_LABELS,
  RECIPE_BUDGETS,
  RECIPE_CATEGORIES,
  RECIPE_DIETS,
  type RecipeCategory,
  type RecipeDiet,
} from "@/lib/recipe-rules";
import {
  deleteRecipe,
  fetchRecipe,
  saveRecipe,
  searchFoods,
  type FoodSuggestion,
} from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

// Clés stables : corriger ou retirer une ligne ne doit pas mélanger les autres.
type Ingredient = { key: number; name: string; quantity: string; foodId: number | null };
type Step = { key: number; text: string };

type Form = {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  chefTip: string;
  category: RecipeCategory | null;
  diets: RecipeDiet[];
  // Temps total tel que tapé (« 35 »), budget de 1 à 3.
  totalMinutes: string;
  budget: number | null;
};

type Errors = {
  title?: string;
  ingredient?: string;
  ingredients?: string;
  steps?: string;
  chefTip?: string;
  totalMinutes?: string;
  save?: string;
};

type DeleteStep = "idle" | "confirm" | "deleting";

let lastKey = 0;
function nextKey(): number {
  lastKey += 1;
  return lastKey;
}

// Écrire une recette dans le carnet d'un foyer, ou la modifier (id). Maquette du 26/11, écran 5
// (https://claude.ai/artifact/8Ei7qPU2mWkKyABtFjBNRw) : les ingrédients se saisissent comme
// les courses (nom, quantité, +) et s'affichent en liste ; les étapes en cartes numérotées.
// Un toucher sur une ligne l'ouvre sur place pour la corriger ou la retirer.
export default function WriteRecipeScreen() {
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const isEditing = Boolean(id);

  // La recette enregistrée : son id, et sa photo en ligne. Après un premier enregistrement dont
  // la photo a échoué, réessayer met à jour cette recette au lieu d'en créer une deuxième.
  const [savedId, setSavedId] = useState<string | null>(id ?? null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  // Une photo choisie, pas encore envoyée (aperçu), ou la photo en ligne à retirer.
  const [pendingPhoto, setPendingPhoto] = useState<{ bytes: Uint8Array; uri: string } | null>(null);
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(
    isEditing
      ? null
      : {
          title: "",
          servings: 4,
          ingredients: [],
          steps: [],
          chefTip: "",
          category: null,
          diets: [],
          totalMinutes: "",
          budget: null,
        },
  );
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");

  // Les deux champs d'ajout, et l'étape à ajouter.
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newStep, setNewStep] = useState("");
  // L'aliment Ciqual proposé pendant la frappe, et celui choisi pour le nom tapé.
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [newFood, setNewFood] = useState<FoodSuggestion | null>(null);
  // La ligne ouverte pour être corrigée (ingrédient ou étape), et ses champs.
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editText, setEditText] = useState("");

  const scrollRef = useRef<ScrollViewInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);
  const quantityRef = useRef<TextInputInstance>(null);
  // Une recherche part 250 ms après la dernière frappe ; seule la plus récente a le droit
  // d'afficher ses suggestions.
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearchRef = useRef(0);

  const load = useCallback(() => {
    if (!id) return;
    fetchRecipe(id).then(
      (recipe) => {
        setPhotoPath(recipe.photoPath);
        setForm({
          title: recipe.title,
          servings: recipe.servings,
          ingredients: recipe.ingredients.map((ingredient) => ({
            key: nextKey(),
            ...fieldsFromIngredient(ingredient),
            foodId: ingredient.foodId,
          })),
          steps: recipe.steps.map((text) => ({ key: nextKey(), text })),
          chefTip: recipe.chefTip ?? "",
          category: recipe.category,
          diets: recipe.diets,
          totalMinutes: recipe.totalMinutes ? String(recipe.totalMinutes) : "",
          budget: recipe.budget,
        });
        setHasFailed(false);
      },
      (error: unknown) => {
        setLoadError(error);
        setHasFailed(true);
      },
    );
  }, [id]);

  // La recette à modifier vient du serveur (un système extérieur) : chargée une fois, pas à
  // chaque retour sur l'écran, pour ne pas écraser ce qu'on est en train d'écrire.
  useEffect(() => {
    load();
  }, [load]);

  // Bouton retour, geste ou en-tête avec des changements non enregistrés : on propose de
  // rester. Après un enregistrement ou un retrait, disablePrevention laisse partir.
  const disablePrevention = usePreventRemove(isDirty, ({ repeat }) => {
    Alert.alert("Quitter sans enregistrer ?", "Ce que tu as écrit sera perdu.", [
      { text: "Rester", style: "cancel" },
      {
        text: "Quitter",
        style: "destructive",
        onPress: () => {
          setIsDirty(false);
          repeat();
        },
      },
    ]);
  });

  if (hasFailed && !form) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir la recette"
        message={loadErrorMessage(loadError)}
        onRetry={load}
      />
    );
  }
  if (!form) return <LoadingScreen />;

  function update(changes: Partial<Form>) {
    setForm((current) => (current ? { ...current, ...changes } : current));
    setIsDirty(true);
  }

  // ─── ingrédients ───

  function changeNewName(text: string) {
    setNewName(text);
    // Un autre nom, un autre aliment : le choix précédent ne vaut plus.
    setNewFood(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    latestSearchRef.current += 1;
    const searchId = latestSearchRef.current;
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      searchFoods(text).then(
        (found) => {
          if (latestSearchRef.current === searchId) setSuggestions(found.slice(0, 5));
        },
        // Sans suggestion, on écrit quand même : l'ingrédient reste en texte libre.
        () => {
          if (latestSearchRef.current === searchId) setSuggestions([]);
        },
      );
    }, 250);
  }

  function chooseFood(food: FoodSuggestion) {
    setNewFood(food);
    setSuggestions([]);
    latestSearchRef.current += 1;
    quantityRef.current?.focus();
  }

  function handleAddIngredient() {
    if (!form) return;
    if (newName.trim() === "") {
      hapticReject();
      setErrors((current) => ({ ...current, ingredient: "Écris le nom de l’ingrédient." }));
      nameRef.current?.focus();
      return;
    }
    hapticAdded();
    update({
      ingredients: [
        ...form.ingredients,
        { key: nextKey(), name: newName, quantity: newQuantity, foodId: newFood?.id ?? null },
      ],
    });
    setNewName("");
    setNewQuantity("");
    setNewFood(null);
    setSuggestions([]);
    latestSearchRef.current += 1;
    setErrors((current) => ({ ...current, ingredient: undefined, ingredients: undefined }));
    // On enchaîne : retour au nom pour l'ingrédient suivant.
    nameRef.current?.focus();
  }

  function openIngredient(ingredient: Ingredient) {
    setEditingKey(ingredient.key);
    setEditName(ingredient.name);
    setEditQuantity(ingredient.quantity);
  }

  function saveIngredient(key: number) {
    if (!form) return;
    if (editName.trim() === "") {
      removeIngredient(key);
      return;
    }
    update({
      ingredients: form.ingredients.map((ingredient) =>
        ingredient.key === key
          ? {
              ...ingredient,
              name: editName,
              quantity: editQuantity,
              // Un autre nom, un autre aliment : on ne garde pas les calories du précédent.
              foodId: ingredient.name === editName ? ingredient.foodId : null,
            }
          : ingredient,
      ),
    });
    setEditingKey(null);
  }

  function removeIngredient(key: number) {
    if (!form) return;
    update({ ingredients: form.ingredients.filter((ingredient) => ingredient.key !== key) });
    setEditingKey(null);
  }

  // ─── étapes ───

  function handleAddStep() {
    if (!form || newStep.trim() === "") return;
    hapticAdded();
    update({ steps: [...form.steps, { key: nextKey(), text: newStep }] });
    setNewStep("");
    setErrors((current) => ({ ...current, steps: undefined }));
  }

  function openStep(step: Step) {
    setEditingKey(step.key);
    setEditText(step.text);
  }

  function saveStep(key: number) {
    if (!form) return;
    if (editText.trim() === "") {
      removeStep(key);
      return;
    }
    update({
      steps: form.steps.map((step) => (step.key === key ? { ...step, text: editText } : step)),
    });
    setEditingKey(null);
  }

  function removeStep(key: number) {
    if (!form) return;
    update({ steps: form.steps.filter((step) => step.key !== key) });
    setEditingKey(null);
  }

  // ─── enregistrer, retirer ───

  // ─── photo ───

  async function handlePickPhoto(source: PhotoSource) {
    setPhotoError(null);
    setIsPicking(true);
    try {
      const picked = await pickRecipePhoto(source);
      if (picked.kind === "denied") {
        setPhotoError("L’appareil photo est refusé : autorise-le dans les réglages du téléphone.");
      } else if (picked.kind === "picked") {
        setPendingPhoto({ bytes: picked.bytes, uri: picked.uri });
        setIsPhotoRemoved(false);
        setIsDirty(true);
      }
    } catch {
      setPhotoError("La photo n’a pas pu être préparée. Réessaie avec une autre.");
    } finally {
      setIsPicking(false);
    }
  }

  function handleRemovePhoto() {
    setPendingPhoto(null);
    setIsPhotoRemoved(photoPath !== null);
    setIsDirty(true);
  }

  async function handleSave() {
    if (!form || isSaving) return;
    // Ce qui reste dans les champs d'ajout compte : on ne perd pas le dernier ingrédient tapé
    // sans avoir touché « + ».
    const pendingIngredients =
      newName.trim() === ""
        ? []
        : [{ name: newName, quantity: newQuantity, foodId: newFood?.id ?? null }];
    const pendingSteps = newStep.trim() === "" ? [] : [newStep];
    const result = buildRecipeDraft({
      title: form.title,
      servings: form.servings,
      ingredients: [...form.ingredients, ...pendingIngredients],
      steps: [...form.steps.map((step) => step.text), ...pendingSteps],
      chefTip: form.chefTip,
      category: form.category,
      diets: form.diets,
      totalMinutes: form.totalMinutes,
      budget: form.budget,
    });
    if (!result.ok) {
      hapticReject();
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setIsSaving(true);
    let recipeId: string;
    try {
      recipeId = await saveRecipe(groupId, savedId, result.draft);
      setSavedId(recipeId);
    } catch (error) {
      hapticReject();
      setErrors({ save: failureMessage("La recette n’a pas été enregistrée", error) });
      setIsSaving(false);
      return;
    }
    // La photo après la recette : son chemin s'enregistre sur une recette qui existe.
    try {
      if (pendingPhoto) {
        setPhotoPath(await uploadRecipePhoto(groupId, recipeId, pendingPhoto.bytes, photoPath));
        setPendingPhoto(null);
      } else if (isPhotoRemoved && photoPath) {
        await removeRecipePhoto(recipeId, photoPath);
        setPhotoPath(null);
        setIsPhotoRemoved(false);
      }
    } catch (error) {
      hapticReject();
      setErrors({
        save: failureMessage("La recette est enregistrée, mais pas la photo", error),
      });
      setIsSaving(false);
      return;
    }
    hapticAdded();
    disablePrevention();
    if (isEditing) router.back();
    else router.replace({ pathname: "/recette/[id]", params: { id: recipeId, groupId } });
  }

  async function handleDelete() {
    if (!id) return;
    setDeleteStep("deleting");
    try {
      await deleteRecipe(id);
      // Le fichier ne sert plus. Un échec laisse un fichier orphelin, sans gêner personne.
      if (photoPath) await removeRecipePhotoFile(photoPath).catch(() => undefined);
      disablePrevention();
      // La recette n'existe plus : retour au carnet, l'écran de la recette dépilé aussi.
      router.dismissTo({ pathname: "/recettes/[groupId]", params: { groupId } });
    } catch (error) {
      setDeleteStep("confirm");
      setErrors({ save: failureMessage("La recette n’a pas été retirée", error) });
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title} accessibilityRole="header">
        {isEditing ? "Modifier la recette" : "Écrire une recette"}
      </Text>

      {/* L'encart du plat : la photo choisie, sinon le livre par défaut. */}
      <RecipeBanner
        recipeId={savedId ?? "nouvelle-recette"}
        photoPath={isPhotoRemoved ? null : photoPath}
        uri={pendingPhoto?.uri}
      />

      <TextField
        label="Nom de la recette"
        value={form.title}
        onChangeText={(title) => update({ title })}
        placeholder="Pot-au-feu"
        maxLength={RECIPE_TITLE_MAX_LENGTH}
        autoCapitalize="sentences"
        error={errors.title}
      />

      <ServingsStepper value={form.servings} onChange={(servings) => update({ servings })} />

      {/* ─── type de plat : un choix unique, facultatif (retoucher le désélectionne) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Type de plat <Text style={styles.count}>· facultatif</Text>
        </Text>
        <View style={styles.categories} accessibilityRole="radiogroup">
          {RECIPE_CATEGORIES.map((category) => {
            const isSelected = form.category === category;
            return (
              <Pressable
                key={category}
                onPress={() => {
                  hapticTick();
                  update({ category: isSelected ? null : category });
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={CATEGORY_LABELS[category]}
                style={({ pressed }) => [
                  styles.category,
                  isSelected && styles.categorySelected,
                  pressed && styles.pressed,
                ]}
              >
                <CategoryIcon category={category} size={24} />
                <Text style={styles.categoryLabel}>{CATEGORY_LABELS[category]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Il sert aux filtres du carnet.</Text>
      </View>

      {/* ─── temps et budget : les filtres « ≤ 30 min » et « Petit budget » les lisent ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Temps et budget <Text style={styles.count}>· facultatifs</Text>
        </Text>
        <View style={styles.timeRow}>
          <View style={[styles.timeField, errors.totalMinutes ? styles.fieldError : null]}>
            <TextInput
              value={form.totalMinutes}
              onChangeText={(totalMinutes) => update({ totalMinutes })}
              placeholder="35"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Temps total, en minutes"
              keyboardType="number-pad"
              maxLength={4}
              style={styles.timeInput}
            />
            <Text style={styles.timeUnit}>min</Text>
          </View>
          <View style={styles.budgets} accessibilityRole="radiogroup">
            {RECIPE_BUDGETS.map((budget) => {
              const isSelected = form.budget === budget;
              return (
                <Pressable
                  key={budget}
                  onPress={() => {
                    hapticTick();
                    update({ budget: isSelected ? null : budget });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={BUDGET_LABELS[budget]}
                  style={({ pressed }) => [
                    styles.budget,
                    isSelected && styles.budgetSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.budgetText, isSelected && styles.budgetTextSelected]}>
                    {"€".repeat(budget)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {errors.totalMinutes ? (
          <Text style={styles.error}>{errors.totalMinutes}</Text>
        ) : (
          <Text style={styles.hint}>Préparation et cuisson comprises. € = petit budget.</Text>
        )}
      </View>

      {/* ─── régimes : des chips à cocher ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Régimes <Text style={styles.count}>· facultatif</Text>
        </Text>
        <View style={styles.diets}>
          {RECIPE_DIETS.map((diet) => {
            const isSelected = form.diets.includes(diet);
            return (
              <Pressable
                key={diet}
                onPress={() => {
                  hapticTick();
                  update({
                    diets: isSelected
                      ? form.diets.filter((chosen) => chosen !== diet)
                      : [...form.diets, diet],
                  });
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={DIET_LABELS[diet]}
                style={({ pressed }) => [
                  styles.diet,
                  isSelected && styles.dietSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.dietLabel, isSelected && styles.dietLabelSelected]}>
                  {DIET_LABELS[diet]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── ingrédients ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Ingrédients
          {form.ingredients.length > 0 ? (
            <Text style={styles.count}> · {form.ingredients.length}</Text>
          ) : null}
        </Text>

        <View style={styles.composer}>
          <View style={[styles.composerField, errors.ingredient ? styles.fieldError : null]}>
            <TextInput
              ref={nameRef}
              value={newName}
              onChangeText={changeNewName}
              placeholder="Ingrédient"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Ingrédient à ajouter"
              autoCapitalize="sentences"
              maxLength={INGREDIENT_LABEL_MAX_LENGTH}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => quantityRef.current?.focus()}
              style={styles.composerInput}
            />
            <View style={styles.composerDivider} />
            <TextInput
              ref={quantityRef}
              value={newQuantity}
              onChangeText={setNewQuantity}
              placeholder="Qté"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Quantité, facultatif"
              maxLength={INGREDIENT_QUANTITY_MAX_LENGTH}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={handleAddIngredient}
              style={styles.composerQuantity}
            />
          </View>
          <Pressable
            onPress={handleAddIngredient}
            accessibilityRole="button"
            accessibilityLabel="Ajouter l’ingrédient"
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Feather name="plus" size={24} color={theme.colors.onPrimary} />
          </Pressable>
        </View>
        {suggestions.length > 0 ? (
          <View style={styles.card} accessibilityLabel="Aliments proposés">
            {suggestions.map((food, index) => (
              <Pressable
                key={food.id}
                onPress={() => chooseFood(food)}
                accessibilityRole="button"
                accessibilityLabel={`Choisir ${food.name}`}
                style={({ pressed }) => [
                  styles.suggestion,
                  index > 0 && styles.divider,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.suggestionName}>{food.name}</Text>
                {food.groupName ? (
                  <Text style={styles.suggestionGroup}>{food.groupName}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        {newFood ? (
          <View style={styles.chosen}>
            <Feather name="check-circle" size={16} color={theme.colors.success} />
            <Text style={styles.chosenText} numberOfLines={1}>
              {newFood.name}
            </Text>
            <TextButton label="Changer" onPress={() => changeNewName(newName)} />
          </View>
        ) : null}
        {errors.ingredient ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {errors.ingredient}
          </Text>
        ) : newFood || suggestions.length > 0 ? null : (
          <Text style={styles.hint}>
            Choisis un aliment proposé pour compter les calories. Quantité libre : « 1 kg », « 3 ».
          </Text>
        )}

        {form.ingredients.length > 0 ? (
          <View style={styles.card}>
            {form.ingredients.map((ingredient, index) =>
              editingKey === ingredient.key ? (
                <View key={ingredient.key} style={[styles.editRow, index > 0 && styles.divider]}>
                  <View style={styles.composerField}>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      accessibilityLabel="Ingrédient"
                      maxLength={INGREDIENT_LABEL_MAX_LENGTH}
                      returnKeyType="done"
                      onSubmitEditing={() => saveIngredient(ingredient.key)}
                      style={styles.composerInput}
                    />
                    <View style={styles.composerDivider} />
                    <TextInput
                      value={editQuantity}
                      onChangeText={setEditQuantity}
                      placeholder="Qté"
                      placeholderTextColor={theme.colors.textMuted}
                      accessibilityLabel="Quantité, facultatif"
                      maxLength={INGREDIENT_QUANTITY_MAX_LENGTH}
                      returnKeyType="done"
                      onSubmitEditing={() => saveIngredient(ingredient.key)}
                      style={styles.composerQuantity}
                    />
                  </View>
                  <View style={styles.editActions}>
                    <TextButton
                      label="Retirer"
                      variant="danger"
                      onPress={() => removeIngredient(ingredient.key)}
                    />
                    <TextButton label="OK" onPress={() => saveIngredient(ingredient.key)} />
                  </View>
                </View>
              ) : (
                <Pressable
                  key={ingredient.key}
                  onPress={() => openIngredient(ingredient)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ingredient.name}${ingredient.quantity ? `, ${ingredient.quantity}` : ""}`}
                  accessibilityHint="Ouvre l’ingrédient pour le corriger ou le retirer"
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && styles.divider,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.rowName}>{ingredient.name}</Text>
                  {ingredient.foodId !== null ? (
                    <Feather
                      name="check-circle"
                      size={14}
                      color={theme.colors.success}
                      accessibilityLabel="Compté dans les calories"
                    />
                  ) : null}
                  {ingredient.quantity ? (
                    <Text style={styles.rowQuantity}>{ingredient.quantity}</Text>
                  ) : null}
                </Pressable>
              ),
            )}
          </View>
        ) : null}
        {form.ingredients.length > 0 ? (
          <Text style={styles.hint}>Touche un ingrédient pour le corriger ou le retirer.</Text>
        ) : null}
        {errors.ingredients ? <Text style={styles.error}>{errors.ingredients}</Text> : null}
      </View>

      {/* ─── étapes ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Étapes
        </Text>

        {form.steps.map((step, index) =>
          editingKey === step.key ? (
            <View key={step.key} style={styles.stepCard}>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                autoFocus
                multiline
                accessibilityLabel={`Étape ${index + 1}`}
                maxLength={RECIPE_STEP_MAX_LENGTH}
                style={[styles.input, styles.stepInput]}
              />
              <View style={styles.editActions}>
                <TextButton label="Retirer" variant="danger" onPress={() => removeStep(step.key)} />
                <TextButton label="OK" onPress={() => saveStep(step.key)} />
              </View>
            </View>
          ) : (
            <Pressable
              key={step.key}
              onPress={() => openStep(step)}
              accessibilityRole="button"
              accessibilityLabel={`Étape ${index + 1} : ${step.text}`}
              accessibilityHint="Ouvre l’étape pour la corriger ou la retirer"
              style={({ pressed }) => [styles.stepCard, styles.stepRow, pressed && styles.pressed]}
            >
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </Pressable>
          ),
        )}

        <View style={styles.composer}>
          <TextInput
            value={newStep}
            onChangeText={setNewStep}
            placeholder={`Étape ${form.steps.length + 1} : ${form.steps.length === 0 ? "par quoi on commence ?" : "et ensuite ?"}`}
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel={`Étape ${form.steps.length + 1} à ajouter`}
            maxLength={RECIPE_STEP_MAX_LENGTH}
            multiline
            style={[styles.input, styles.stepInput, styles.grow]}
          />
          <Pressable
            onPress={handleAddStep}
            disabled={newStep.trim() === ""}
            accessibilityRole="button"
            accessibilityLabel="Ajouter l’étape"
            accessibilityState={{ disabled: newStep.trim() === "" }}
            style={({ pressed }) => [
              styles.addButton,
              styles.addButtonSoft,
              (pressed || newStep.trim() === "") && styles.pressed,
            ]}
          >
            <Feather name="plus" size={24} color={theme.colors.chipText} />
          </Pressable>
        </View>
        {errors.steps ? <Text style={styles.error}>{errors.steps}</Text> : null}
      </View>

      {/* ─── astuce du chef, facultative ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          L’astuce du chef <Text style={styles.count}>· facultative</Text>
        </Text>
        <Text style={styles.muted}>
          Le geste qui fait la différence. Elle s’affiche avant les étapes, avec le chat cuisinier.
        </Text>
        <TextInput
          value={form.chefTip}
          onChangeText={(chefTip) => update({ chefTip })}
          placeholder="Laisse reposer la pâte 1 h : les crêpes seront plus fines."
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="L’astuce du chef"
          maxLength={RECIPE_CHEF_TIP_MAX_LENGTH}
          multiline
          style={[styles.input, styles.stepInput]}
        />
        {errors.chefTip ? <Text style={styles.error}>{errors.chefTip}</Text> : null}
      </View>

      {/* ─── photo, facultative ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Photo <Text style={styles.count}>· facultative</Text>
        </Text>
        <Text style={styles.muted}>
          Elle illustre le plat en haut de la recette. Tu pourras aussi l’ajouter plus tard.
        </Text>
        <View style={styles.photoActions}>
          <TextButton
            label={isPicking ? "Ouverture…" : "Prendre une photo"}
            onPress={() => handlePickPhoto("camera")}
            isDisabled={isPicking || isSaving}
          />
          <TextButton
            label="Choisir dans la galerie"
            onPress={() => handlePickPhoto("library")}
            isDisabled={isPicking || isSaving}
          />
          {pendingPhoto || (photoPath && !isPhotoRemoved) ? (
            <TextButton
              label="Retirer la photo"
              variant="danger"
              onPress={handleRemovePhoto}
              isDisabled={isPicking || isSaving}
            />
          ) : null}
        </View>
        {photoError ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {photoError}
          </Text>
        ) : null}
      </View>

      {errors.save ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {errors.save}
        </Text>
      ) : null}
      <PrimaryButton
        label="Enregistrer la recette"
        onPress={handleSave}
        isLoading={isSaving}
        isDisabled={deleteStep === "deleting"}
      />

      {isEditing && deleteStep === "idle" ? (
        <TextButton
          label="Retirer du carnet"
          variant="danger"
          onPress={() => {
            setDeleteStep("confirm");
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          }}
          isDisabled={isSaving}
        />
      ) : null}

      {deleteStep !== "idle" ? (
        <Card>
          <Text style={styles.confirmTitle} accessibilityRole="header">
            Retirer « {form.title} » ?
          </Text>
          <Text style={styles.muted}>
            Elle disparaît du carnet pour tout le foyer. Pas de retour en arrière.
          </Text>
          <PrimaryButton
            label="Retirer la recette"
            variant="danger"
            onPress={handleDelete}
            isLoading={deleteStep === "deleting"}
          />
          <TextButton
            label="Annuler"
            onPress={() => setDeleteStep("idle")}
            isDisabled={deleteStep === "deleting"}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, control, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    hint: { marginLeft: spacing.xs, color: colors.textMuted, fontSize: fontSize.caption },
    section: { gap: spacing.sm },
    // Titre de section v4 : discret, comme un en-tête de liste groupée.
    sectionTitle: {
      paddingHorizontal: spacing.xs,
      color: colors.textMuted,
      fontSize: fontSize.small,
      fontWeight: "700",
    },
    count: { fontWeight: "400" },

    // Le même composant d'ajout que la liste de courses : nom | quantité, puis +.
    composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
    composerField: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      height: control.lg,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    fieldError: { borderColor: colors.danger },
    composerInput: {
      flex: 1,
      height: "100%",
      paddingHorizontal: spacing.lg,
      color: colors.text,
      fontSize: fontSize.body,
    },
    composerDivider: { width: 1, height: 28, backgroundColor: colors.border },
    composerQuantity: {
      width: 96,
      height: "100%",
      paddingHorizontal: spacing.md,
      color: colors.text,
      fontSize: fontSize.body,
    },
    addButton: {
      width: control.lg,
      height: control.lg,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    addButtonSoft: { backgroundColor: colors.chipBg },
    pressed: { opacity: 0.6 },

    card: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: cardShadow },
    row: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowName: { flex: 1, color: colors.text, fontSize: fontSize.body },
    rowQuantity: { color: colors.chipText, fontSize: fontSize.body, fontWeight: "700" },
    editRow: { gap: spacing.sm, padding: spacing.md },
    photoActions: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg },
    suggestion: { gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    suggestionName: { color: colors.text, fontSize: fontSize.body },
    suggestionGroup: { color: colors.textMuted, fontSize: fontSize.caption },
    chosen: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: spacing.xs },
    chosenText: { flex: 1, color: colors.success, fontSize: fontSize.small },
    editActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.lg },

    stepCard: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
    stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    stepNumber: {
      width: 26,
      height: 26,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.chipBg,
    },
    stepNumberText: { color: colors.chipText, fontSize: fontSize.caption, fontWeight: "800" },
    stepText: {
      flex: 1,
      paddingTop: 3,
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: 24,
    },
    input: {
      minHeight: control.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: fontSize.body,
    },
    stepInput: { minHeight: 80, textAlignVertical: "top", lineHeight: 22 },
    grow: { flex: 1 },

    // Type de plat : quatre cases côte à côte, une seule choisie (contour tomate).
    categories: { flexDirection: "row", gap: spacing.xs + 2 },
    category: {
      flex: 1,
      height: 68,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.surface,
      backgroundColor: colors.surface,
    },
    categorySelected: { borderColor: colors.primary, backgroundColor: colors.chipBg },
    categoryLabel: { color: colors.text, fontSize: fontSize.caption, fontWeight: "600" },
    // Temps : un petit champ avec son unité ; budget : trois chips, une seule choisie.
    timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    timeField: {
      width: 104,
      height: control.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.surface,
    },
    timeInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: fontSize.body },
    timeUnit: { color: colors.textMuted, fontSize: fontSize.small },
    budgets: { flex: 1, flexDirection: "row", gap: spacing.xs + 2 },
    budget: {
      flex: 1,
      height: control.lg,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.surface,
      backgroundColor: colors.surface,
    },
    budgetSelected: { borderColor: colors.primary, backgroundColor: colors.chipBg },
    budgetText: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    budgetTextSelected: { color: colors.chipText },
    // Régimes : chips à cocher, basilic une fois cochées (comme les pills du carnet).
    diets: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
    diet: {
      height: control.sm,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    dietSelected: { borderColor: colors.dietBg, backgroundColor: colors.dietBg },
    dietLabel: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
    dietLabelSelected: { color: colors.dietText },

    error: { color: colors.danger, fontSize: fontSize.small },
    confirmTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.cardTitle,
    },
  });
}
