import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChefTip } from "@/components/chef-tip";
import { IconButton } from "@/components/icon-button";
import { IngredientList } from "@/components/ingredient-list";
import { PrimaryButton } from "@/components/primary-button";
import { RecipeBanner } from "@/components/recipe-tile";
import { Section } from "@/components/section";
import { ServingsStepper } from "@/components/servings-stepper";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { hapticAdded, hapticReject } from "@/lib/haptics";
import { pickRecipePhoto, type PhotoSource } from "@/lib/photo-picker";
import { uploadRecipePhoto } from "@/lib/photo-storage";
import { macrosPerServing, recipeMeta } from "@/lib/recipe-rules";
import { copyBaseRecipe, fetchRecipe, subscribeToCarnet, type Recipe } from "@/lib/recipes";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
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
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
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
      (error: unknown) => {
        if (latestRequestRef.current !== requestId) return;
        setLoadError(error);
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
        message={`Elle a peut-être été retirée du carnet. ${loadErrorMessage(loadError)}`}
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
    } catch (error) {
      hapticReject();
      setPhotoError(failureMessage("La photo n’a pas été enregistrée", error));
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
    } catch (error) {
      hapticReject();
      setCopyError(failureMessage("La recette n’a pas pu être ajoutée", error));
      setIsCopying(false);
    }
  }

  const meta = recipeMeta(recipe.totalMinutes, recipe.budget, recipe.diets, recipe.category);
  const hasSteps = recipe.steps.length > 0;

  function openCooking() {
    router.push({
      pathname: "/recette/cuisine",
      params: { id: id, servings: String(servings) },
    });
  }

  function openShopping() {
    router.push({ pathname: "/recette/courses", params: { id: id } });
  }

  return (
    <View style={styles.screen}>
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
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* La photo d'un bord à l'autre : c'est elle qui donne envie. */}
        <View>
          <RecipeBanner recipeId={recipe.id} photoPath={recipe.photoPath} isHero />
          {isBase ? null : (
            <IconButton
              icon="camera"
              size="md"
              accessibilityLabel={recipe.photoPath ? "Changer la photo" : "Ajouter une photo"}
              onPress={askPhotoSource}
              isDisabled={isPhotoBusy}
              style={styles.photoButton}
            />
          )}
        </View>

        <View style={styles.container}>
          {photoError ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {photoError}
            </Text>
          ) : null}

          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {recipe.title}
            </Text>
            {meta || isBase ? (
              <Text style={styles.meta}>
                {[meta, isBase ? "Recette de base" : null].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>

          {/* Les parts et l'estimation d'une part sur la même ligne : changer les parts
              change les quantités juste en dessous. */}
          <View style={styles.servingsRow}>
            <ServingsStepper value={servings} onChange={setChosenServings} />
            {macros ? <Text style={styles.kcal}>≈ {macros.kcal} kcal la part</Text> : null}
          </View>

          {recipe.ingredients.length > 0 ? (
            <Section
              title="Ingrédients"
              action={isBase ? undefined : { label: "Ajouter aux courses", onPress: openShopping }}
              footnote={
                macros
                  ? `Par part : protéines ${macros.proteinG} g · glucides ${macros.carbsG} g · lipides ${macros.fatG} g. Estimation d’après la table Ciqual 2025 de l’Anses, pas un conseil de santé.${
                      macros.uncounted > 0
                        ? ` ${macros.uncounted} ingrédient${macros.uncounted > 1 ? "s" : ""} non compté${macros.uncounted > 1 ? "s" : ""}.`
                        : ""
                    }`
                  : undefined
              }
            >
              <IngredientList
                ingredients={recipe.ingredients}
                recipeServings={recipe.servings}
                servings={servings}
              />
            </Section>
          ) : null}

          {/* Avant les étapes : à lire avant de commencer. */}
          {recipe.chefTip ? <ChefTip text={recipe.chefTip} /> : null}

          {hasSteps ? (
            <Section title="Étapes">
              <View style={styles.steps}>
                {recipe.steps.map((step, index) => (
                  <View key={index} style={styles.step} accessible>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {isBase ? (
            <Text style={styles.caption}>
              Une idée écrite pour l’app. Ajoute-la à ton carnet pour la modifier.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* En bas, sous le pouce : l'action principale, et le panier à côté. Une recette de
          base hors d'un carnet, sans étapes, n'a rien à proposer. */}
      {isBase && !groupId && !hasSteps ? null : (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          {copyError ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {copyError}
            </Text>
          ) : null}
          <View style={styles.bottomRow}>
            {isBase && groupId ? (
              <>
                <PrimaryButton
                  label="Ajouter à mon carnet"
                  onPress={handleCopy}
                  isLoading={isCopying}
                  style={styles.grow}
                />
                {hasSteps ? (
                  <IconButton
                    icon="play"
                    accessibilityLabel="Cuisiner, étape par étape"
                    onPress={openCooking}
                  />
                ) : null}
              </>
            ) : (
              <>
                {hasSteps ? (
                  <PrimaryButton label="Cuisiner" onPress={openCooking} style={styles.grow} />
                ) : (
                  <PrimaryButton
                    label="Ajouter aux courses"
                    onPress={openShopping}
                    style={styles.grow}
                  />
                )}
                {hasSteps && !isBase ? (
                  <IconButton
                    icon="shopping-cart"
                    accessibilityLabel="Ajouter aux courses"
                    onPress={openShopping}
                  />
                ) : null}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, paddingBottom: spacing.xl },
    container: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xl },
    photoButton: { position: "absolute", right: spacing.lg, bottom: spacing.md },
    header: { gap: spacing.xs },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    meta: { color: colors.textMuted, fontSize: fontSize.small },
    caption: { color: colors.textMuted, fontSize: fontSize.caption, lineHeight: 18 },
    servingsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    kcal: { color: colors.textMuted, fontSize: fontSize.small },
    steps: { gap: spacing.lg },
    step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    stepNumber: {
      width: 26,
      height: 26,
      marginTop: 1,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.chipBg,
    },
    stepNumberText: { color: colors.chipText, fontSize: fontSize.caption, fontWeight: "800" },
    stepText: { flex: 1, color: colors.text, fontSize: fontSize.body, lineHeight: 26 },
    bottomBar: {
      gap: spacing.sm,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    bottomRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    grow: { flex: 1 },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
