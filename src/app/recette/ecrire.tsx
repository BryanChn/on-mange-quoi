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
import { ServingsStepper } from "@/components/servings-stepper";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { hapticAdded, hapticReject } from "@/lib/haptics";
import {
  buildRecipeDraft,
  fieldsFromIngredient,
  INGREDIENT_LABEL_MAX_LENGTH,
  INGREDIENT_QUANTITY_MAX_LENGTH,
  RECIPE_STEP_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@/lib/recipe-rules";
import { deleteRecipe, fetchRecipe, saveRecipe } from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

// Clés stables : corriger ou retirer une ligne ne doit pas mélanger les autres.
type Ingredient = { key: number; name: string; quantity: string; foodId: number | null };
type Step = { key: number; text: string };

type Form = { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] };

type Errors = {
  title?: string;
  ingredient?: string;
  ingredients?: string;
  steps?: string;
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

  const [form, setForm] = useState<Form | null>(
    isEditing ? null : { title: "", servings: 4, ingredients: [], steps: [] },
  );
  const [hasFailed, setHasFailed] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");

  // Les deux champs d'ajout, et l'étape à ajouter.
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newStep, setNewStep] = useState("");
  // La ligne ouverte pour être corrigée (ingrédient ou étape), et ses champs.
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editText, setEditText] = useState("");

  const scrollRef = useRef<ScrollViewInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);
  const quantityRef = useRef<TextInputInstance>(null);

  const load = useCallback(() => {
    if (!id) return;
    fetchRecipe(id).then(
      (recipe) => {
        setForm({
          title: recipe.title,
          servings: recipe.servings,
          ingredients: recipe.ingredients.map((ingredient) => ({
            key: nextKey(),
            ...fieldsFromIngredient(ingredient),
            foodId: ingredient.foodId,
          })),
          steps: recipe.steps.map((text) => ({ key: nextKey(), text })),
        });
        setHasFailed(false);
      },
      () => setHasFailed(true),
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
        message="Vérifie ta connexion et réessaie."
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
        { key: nextKey(), name: newName, quantity: newQuantity, foodId: null },
      ],
    });
    setNewName("");
    setNewQuantity("");
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

  async function handleSave() {
    if (!form || isSaving) return;
    // Ce qui reste dans les champs d'ajout compte : on ne perd pas le dernier ingrédient tapé
    // sans avoir touché « + ».
    const pendingIngredients =
      newName.trim() === ""
        ? []
        : [{ name: newName, quantity: newQuantity, foodId: null as number | null }];
    const pendingSteps = newStep.trim() === "" ? [] : [newStep];
    const result = buildRecipeDraft({
      title: form.title,
      servings: form.servings,
      ingredients: [...form.ingredients, ...pendingIngredients],
      steps: [...form.steps.map((step) => step.text), ...pendingSteps],
    });
    if (!result.ok) {
      hapticReject();
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setIsSaving(true);
    try {
      const savedId = await saveRecipe(groupId, id ?? null, result.draft);
      hapticAdded();
      disablePrevention();
      if (isEditing) router.back();
      else router.replace({ pathname: "/recette/[id]", params: { id: savedId, groupId } });
    } catch {
      hapticReject();
      setErrors({ save: "La recette n’a pas été enregistrée. Vérifie ta connexion et réessaie." });
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleteStep("deleting");
    try {
      await deleteRecipe(id);
      disablePrevention();
      // La recette n'existe plus : retour au carnet, l'écran de la recette dépilé aussi.
      router.dismissTo({ pathname: "/recettes/[groupId]", params: { groupId } });
    } catch {
      setDeleteStep("confirm");
      setErrors({ save: "La recette n’a pas été retirée. Vérifie ta connexion et réessaie." });
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
              onChangeText={setNewName}
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
        {errors.ingredient ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {errors.ingredient}
          </Text>
        ) : (
          <Text style={styles.hint}>Quantité libre : « 1 kg », « 3 », « 2 c. à soupe ».</Text>
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

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xxl },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    hint: { marginLeft: spacing.xs, color: colors.textMuted, fontSize: fontSize.caption },
    section: { gap: spacing.md },
    sectionTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22 },
    count: { color: colors.textMuted, fontSize: 15 },

    // Le même composant d'ajout que la liste de courses : nom | quantité, puis +.
    composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
    composerField: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      height: 54,
      borderWidth: 2,
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
      width: 54,
      height: 54,
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
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    rowName: { flex: 1, color: colors.text, fontSize: fontSize.body },
    rowQuantity: { color: colors.chipText, fontSize: fontSize.body, fontWeight: "700" },
    editRow: { gap: spacing.sm, padding: spacing.md },
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
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    stepNumberText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
    stepText: {
      flex: 1,
      paddingTop: 3,
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: 24,
    },
    input: {
      minHeight: 54,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: fontSize.body,
    },
    stepInput: { minHeight: 80, textAlignVertical: "top", lineHeight: 22 },
    grow: { flex: 1 },

    error: { color: colors.danger, fontSize: fontSize.small },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
