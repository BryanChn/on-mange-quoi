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
  ingredientPreview,
  INGREDIENT_RAW_MAX_LENGTH,
  parseIngredientLine,
  RECIPE_STEP_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "@/lib/recipe-rules";
import { deleteRecipe, fetchRecipe, saveRecipe } from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

// Une ligne du formulaire, avec une clé stable : retirer la 2e ligne ne doit pas faire
// passer le texte de la 3e dans le champ de la 2e.
type Line = { key: number; text: string; foodId: number | null };

type Form = { title: string; servings: number; ingredients: Line[]; steps: Line[] };

type Errors = { title?: string; ingredients?: string; steps?: string; save?: string };

type DeleteStep = "idle" | "confirm" | "deleting";

let nextKey = 0;
function line(text = "", foodId: number | null = null): Line {
  nextKey += 1;
  return { key: nextKey, text, foodId };
}

function emptyForm(): Form {
  return { title: "", servings: 4, ingredients: [line()], steps: [line()] };
}

// Écrire une recette dans le carnet d'un foyer, ou la modifier (id) : nom, parts, une ligne
// par ingrédient (l'app montre ce qu'elle a compris), les étapes. Quitter avec des changements
// non enregistrés demande confirmation.
export default function WriteRecipeScreen() {
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const isEditing = Boolean(id);

  const [form, setForm] = useState<Form | null>(isEditing ? null : emptyForm());
  const [hasFailed, setHasFailed] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const scrollRef = useRef<ScrollViewInstance>(null);

  const load = useCallback(() => {
    if (!id) return;
    fetchRecipe(id).then(
      (recipe) => {
        setForm({
          title: recipe.title,
          servings: recipe.servings,
          ingredients: [...recipe.ingredients.map((i) => line(i.raw, i.foodId)), line()],
          steps: [...recipe.steps.map((step) => line(step)), line()],
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

  // Modifier une ligne. Un ingrédient qui change de texte perd son aliment Ciqual. Taper dans
  // la dernière ligne en ajoute une vide dessous : pas de bouton à chercher entre deux lignes.
  function changeLine(list: "ingredients" | "steps", key: number, text: string) {
    if (!form) return;
    const lines = form[list].map((l) =>
      l.key === key ? { ...l, text, foodId: l.text === text ? l.foodId : null } : l,
    );
    if (lines.at(-1)?.key === key && text.trim() !== "") lines.push(line());
    update({ [list]: lines });
  }

  function removeLine(list: "ingredients" | "steps", key: number) {
    if (!form) return;
    const lines = form[list].filter((l) => l.key !== key);
    update({ [list]: lines.length > 0 ? lines : [line()] });
  }

  async function handleSave() {
    if (!form || isSaving) return;
    const result = buildRecipeDraft({
      title: form.title,
      servings: form.servings,
      ingredients: form.ingredients.map((l) => ({ raw: l.text, foodId: l.foodId })),
      steps: form.steps.map((l) => l.text),
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
        placeholder="Pâtes à la bolognaise"
        maxLength={RECIPE_TITLE_MAX_LENGTH}
        autoCapitalize="sentences"
        error={errors.title}
      />

      <ServingsStepper value={form.servings} onChange={(servings) => update({ servings })} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Ingrédients
          </Text>
          <Text style={styles.muted}>
            Une ligne par ingrédient, comme tu l’écrirais : « 500 g de bœuf ».
          </Text>
        </View>
        {form.ingredients.map((ingredient, index) => {
          const preview = ingredientPreview(ingredient.text);
          const isLast = index === form.ingredients.length - 1;
          return (
            <View key={ingredient.key} style={styles.lineRow}>
              <View style={styles.lineField}>
                <TextInput
                  value={ingredient.text}
                  onChangeText={(text) => changeLine("ingredients", ingredient.key, text)}
                  placeholder={isLast && index > 0 ? "Un ingrédient de plus" : "500 g de bœuf"}
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={INGREDIENT_RAW_MAX_LENGTH}
                  accessibilityLabel={`Ingrédient ${index + 1}`}
                  style={styles.input}
                />
                {preview ? (
                  <Text
                    style={[
                      styles.preview,
                      parseIngredientLine(ingredient.text).quantity === null && styles.previewMuted,
                    ]}
                  >
                    {preview}
                  </Text>
                ) : null}
              </View>
              {ingredient.text !== "" ? (
                <RemoveButton
                  label={`Retirer l’ingrédient ${index + 1}`}
                  onPress={() => removeLine("ingredients", ingredient.key)}
                  theme={theme}
                  styles={styles}
                />
              ) : null}
            </View>
          );
        })}
        {errors.ingredients ? <Text style={styles.error}>{errors.ingredients}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Étapes
        </Text>
        {form.steps.map((step, index) => (
          <View key={step.key} style={styles.lineRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <TextInput
              value={step.text}
              onChangeText={(text) => changeLine("steps", step.key, text)}
              placeholder={index === 0 ? "Hacher l’oignon…" : "Et ensuite ?"}
              placeholderTextColor={theme.colors.textMuted}
              maxLength={RECIPE_STEP_MAX_LENGTH}
              multiline
              accessibilityLabel={`Étape ${index + 1}`}
              style={[styles.input, styles.stepInput]}
            />
            {step.text !== "" ? (
              <RemoveButton
                label={`Retirer l’étape ${index + 1}`}
                onPress={() => removeLine("steps", step.key)}
                theme={theme}
                styles={styles}
              />
            ) : null}
          </View>
        ))}
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

function RemoveButton({
  label,
  onPress,
  theme,
  styles,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.remove, pressed && styles.dimmed]}
    >
      <Feather name="x" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    section: { gap: spacing.md },
    sectionHeader: { gap: spacing.xs },
    sectionTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22 },
    lineRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    lineField: { flex: 1, gap: spacing.xs },
    input: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: fontSize.body,
    },
    stepInput: { textAlignVertical: "top" },
    preview: { marginLeft: spacing.lg, color: colors.success, fontSize: fontSize.caption },
    previewMuted: { color: colors.textMuted },
    stepNumber: {
      width: 32,
      height: 32,
      marginTop: 10,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.chipBg,
    },
    stepNumberText: { color: colors.chipText, fontSize: 15, fontWeight: "800" },
    remove: {
      width: 44,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    dimmed: { opacity: 0.5 },
    error: { color: colors.danger, fontSize: fontSize.small },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
