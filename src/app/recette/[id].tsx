import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { RecipeBanner } from "@/components/recipe-tile";
import { ServingsStepper } from "@/components/servings-stepper";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { hapticAdded, hapticReject } from "@/lib/haptics";
import { pickRecipePhoto, type PhotoSource } from "@/lib/photo-picker";
import { uploadRecipePhoto } from "@/lib/photo-storage";
import { formatAmount, macrosPerServing, scaleAmount } from "@/lib/recipe-rules";
import { copyBaseRecipe, fetchRecipe, subscribeToCarnet, type Recipe } from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

// Une recette : les parts changent les quantités à l'écran (rien n'est enregistré), les
// calories et les macros d'une part, les ingrédients, les étapes. Une recette de base se lit
// et s'ajoute au carnet ; la copie, elle, se modifie.
export default function RecipeScreen() {
  // groupId : le carnet d'où l'on vient, celui qui reçoit une recette de base ajoutée.
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // null : les parts de la recette ; un nombre : celles choisies à l'écran.
  const [chosenServings, setChosenServings] = useState<number | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const latestRequestRef = useRef(0);

  const load = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;
    fetchRecipe(id).then(
      (loaded) => {
        if (latestRequestRef.current !== requestId) return;
        setRecipe(loaded);
        setHasFailed(false);
      },
      () => {
        if (latestRequestRef.current !== requestId) return;
        setHasFailed(true);
      },
    );
  }, [id]);

  const recipeGroupId = recipe?.groupId ?? null;

  // Un autre membre modifie la recette : elle se met à jour. Une recette de base ne bouge pas.
  useFocusEffect(
    useCallback(() => {
      load();
      return recipeGroupId ? subscribeToCarnet(recipeGroupId, load) : undefined;
    }, [load, recipeGroupId]),
  );

  if (hasFailed && !recipe) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir la recette"
        message="Elle a peut-être été retirée du carnet. Vérifie ta connexion et réessaie."
        onRetry={load}
      />
    );
  }
  if (!recipe) return <LoadingScreen />;

  const servings = chosenServings ?? recipe.servings;
  const macros = macrosPerServing(recipe.ingredients, recipe.servings);
  const isBase = recipe.groupId === null;

  // Ajouter ou changer la photo après coup, sans passer par « Modifier ».
  async function handlePhoto(source: PhotoSource) {
    if (!recipe?.groupId) return;
    setPhotoError(null);
    setIsPhotoBusy(true);
    try {
      const picked = await pickRecipePhoto(source);
      if (picked.kind === "denied") {
        setPhotoError("L’appareil photo est refusé : autorise-le dans les réglages du téléphone.");
      } else if (picked.kind === "picked") {
        await uploadRecipePhoto(recipe.groupId, recipe.id, picked.bytes, recipe.photoPath);
        hapticAdded();
        load();
      }
    } catch {
      hapticReject();
      setPhotoError("La photo n’a pas été enregistrée. Vérifie ta connexion et réessaie.");
    } finally {
      setIsPhotoBusy(false);
    }
  }

  function askPhotoSource() {
    Alert.alert(recipe?.photoPath ? "Changer la photo" : "Ajouter une photo", undefined, [
      { text: "Prendre une photo", onPress: () => handlePhoto("camera") },
      { text: "Choisir dans la galerie", onPress: () => handlePhoto("library") },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  async function handleCopy() {
    if (!groupId || isCopying) return;
    setIsCopying(true);
    setCopyError(null);
    try {
      const copyId = await copyBaseRecipe(id, groupId);
      hapticAdded();
      // La copie remplace la recette de base : le retour ramène au carnet.
      router.replace({ pathname: "/recette/[id]", params: { id: copyId, groupId } });
    } catch {
      hapticReject();
      setCopyError("La recette n’a pas pu être ajoutée. Vérifie ta connexion et réessaie.");
      setIsCopying(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
    >
      {/* Une recette du carnet se modifie ; une recette de base, jamais (on la copie). */}
      <Stack.Screen
        options={{
          headerRight: isBase
            ? undefined
            : () => (
                <TextButton
                  label="Modifier"
                  onPress={() =>
                    router.push({
                      pathname: "/recette/ecrire",
                      params: { groupId: recipe.groupId ?? "", id: recipe.id },
                    })
                  }
                />
              ),
        }}
      />
      <View style={styles.bannerBlock}>
        <RecipeBanner recipeId={recipe.id} photoPath={recipe.photoPath} />
        {isBase ? null : (
          <TextButton
            label={
              isPhotoBusy
                ? "Envoi de la photo…"
                : recipe.photoPath
                  ? "Changer la photo"
                  : "Ajouter une photo"
            }
            onPress={askPhotoSource}
            isDisabled={isPhotoBusy}
          />
        )}
        {photoError ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {photoError}
          </Text>
        ) : null}
      </View>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {recipe.title}
        </Text>
        {isBase ? (
          <Text style={styles.muted}>Une idée écrite pour l’app. Ajoute-la pour la modifier.</Text>
        ) : null}
      </View>

      <ServingsStepper value={servings} onChange={setChosenServings} />

      {macros ? (
        <View style={styles.macros} accessible>
          <Text style={styles.macrosTitle}>≈ {macros.kcal} kcal par part</Text>
          <Text style={styles.muted}>
            Protéines {macros.proteinG} g · Glucides {macros.carbsG} g · Lipides {macros.fatG} g
          </Text>
          <Text style={styles.caption}>
            Estimation d’après la table Ciqual 2025 de l’Anses, pas un conseil de santé.
            {macros.uncounted > 0
              ? ` ${macros.uncounted} ingrédient${macros.uncounted > 1 ? "s" : ""} non compté${macros.uncounted > 1 ? "s" : ""}.`
              : ""}
          </Text>
        </View>
      ) : null}

      {recipe.ingredients.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Ingrédients
          </Text>
          <View style={styles.card}>
            {recipe.ingredients.map((ingredient, index) => {
              const amount = scaleAmount(
                ingredient.quantity,
                ingredient.unit,
                recipe.servings,
                servings,
              );
              return (
                <View
                  key={index}
                  style={[styles.ingredient, index > 0 && styles.ingredientDivider]}
                  accessible
                >
                  <Text style={styles.amount}>{amount ? formatAmount(amount) : ""}</Text>
                  <Text style={styles.ingredientLabel}>{ingredient.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {recipe.steps.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Étapes
          </Text>
          {recipe.steps.map((step, index) => (
            <View key={index} style={styles.step} accessible>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {isBase && groupId ? (
        <View style={styles.section}>
          {copyError ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {copyError}
            </Text>
          ) : null}
          <PrimaryButton label="Ajouter à mon carnet" onPress={handleCopy} isLoading={isCopying} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    header: { gap: spacing.xs },
    bannerBlock: { gap: spacing.xs, alignItems: "center" },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    caption: { color: colors.textMuted, fontSize: fontSize.caption, lineHeight: 18 },
    macros: {
      gap: spacing.xs,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
    },
    macrosTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    section: { gap: spacing.md },
    sectionTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22 },
    card: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: cardShadow },
    ingredient: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    ingredientDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    amount: { width: 104, color: colors.chipText, fontSize: fontSize.body, fontWeight: "700" },
    ingredientLabel: { flex: 1, color: colors.text, fontSize: fontSize.body },
    step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    stepNumber: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    stepNumberText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
    stepText: {
      flex: 1,
      paddingTop: 4,
      color: colors.text,
      fontSize: fontSize.body,
      lineHeight: 24,
    },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
