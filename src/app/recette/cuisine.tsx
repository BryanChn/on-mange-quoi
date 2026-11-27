import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { RecipeBanner } from "@/components/recipe-tile";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { hapticAdded, hapticReject, hapticTick, hapticToggle } from "@/lib/haptics";
import { pickRecipePhoto } from "@/lib/photo-picker";
import { uploadRecipePhoto } from "@/lib/photo-storage";
import { formatAmount, gatheringMessage, scaleAmount, servingsLabel } from "@/lib/recipe-rules";
import { fetchRecipe, type Recipe } from "@/lib/recipes";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

type PhotoState = "idle" | "sending" | "sent";

// Le mode cuisine : les ingrédients à sortir pour les parts choisies, puis une étape par
// écran en gros caractères, de grands boutons pour avancer les mains occupées, et l'écran qui
// reste allumé. À la fin, « Prendre le plat en photo » devient la photo de la recette.
export default function CookingScreen() {
  const { id, servings: servingsParam } = useLocalSearchParams<{ id: string; servings?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  // Le téléphone posé sur le plan de travail ne se met pas en veille entre deux étapes.
  useKeepAwake();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  // 0 : les ingrédients ; 1 à n : les étapes ; n + 1 : la fin.
  const [page, setPage] = useState(0);
  // Les ingrédients déjà sortis, par position dans la recette.
  const [gathered, setGathered] = useState<Set<number>>(new Set());
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  // La photo prise à la fin, affichée tout de suite dans l'encart.
  const [newPhotoPath, setNewPhotoPath] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchRecipe(id).then(
      (loaded) => {
        setRecipe(loaded);
        setHasFailed(false);
      },
      (error: unknown) => {
        setLoadError(error);
        setHasFailed(true);
      },
    );
  }, [id]);

  // La recette vient du serveur (un système extérieur) : chargée une fois.
  useEffect(() => {
    load();
  }, [load]);

  if (hasFailed && !recipe) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir la recette"
        message={loadErrorMessage(loadError)}
        onRetry={load}
      />
    );
  }
  if (!recipe) return <LoadingScreen />;

  const servings = Math.min(20, Math.max(1, Number(servingsParam) || recipe.servings));
  const stepCount = recipe.steps.length;
  const lastPage = stepCount + 1;
  const isIngredients = page === 0;
  const isEnd = page === lastPage;

  function goTo(next: number) {
    if (next < 0 || next > lastPage) return;
    hapticTick();
    setPage(next);
  }

  function toggleGathered(index: number) {
    const next = new Set(gathered);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    hapticToggle(next.has(index));
    setGathered(next);
  }

  async function handleTakePhoto() {
    if (!recipe?.groupId) return;
    setPhotoError(null);
    try {
      const picked = await pickRecipePhoto("camera");
      if (picked.kind === "denied") {
        setPhotoError("L’appareil photo est refusé : autorise-le dans les réglages du téléphone.");
        return;
      }
      if (picked.kind !== "picked") return;
      setPhotoState("sending");
      setNewPhotoPath(
        await uploadRecipePhoto(recipe.groupId, recipe.id, picked.bytes, recipe.photoPath),
      );
      hapticAdded();
      setPhotoState("sent");
    } catch (error) {
      hapticReject();
      setPhotoState("idle");
      setPhotoError(failureMessage("La photo n’a pas été enregistrée", error));
    }
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + theme.spacing.lg },
      ]}
    >
      <View style={styles.progressRow} accessibilityElementsHidden>
        {Array.from({ length: lastPage + 1 }, (_, index) => (
          <View key={index} style={[styles.progress, index <= page && styles.progressDone]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isIngredients ? (
          <>
            <Text style={styles.kicker}>
              {recipe.title} · {servingsLabel(servings)}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              On sort les ingrédients
            </Text>
            {/* La consigne, puis le compte : cocher n'est jamais obligatoire pour commencer. */}
            <Text style={styles.muted} accessibilityLiveRegion="polite">
              {gatheringMessage(gathered.size, recipe.ingredients.length)}
            </Text>
            {recipe.ingredients.length > 0 ? (
              <View style={styles.card}>
                {recipe.ingredients.map((ingredient, index) => {
                  const amount = scaleAmount(
                    ingredient.quantity,
                    ingredient.unit,
                    recipe.servings,
                    servings,
                  );
                  const isGathered = gathered.has(index);
                  return (
                    <Pressable
                      key={index}
                      onPress={() => toggleGathered(index)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isGathered }}
                      accessibilityLabel={`${amount ? `${formatAmount(amount)} ` : ""}${ingredient.label}`}
                      style={[styles.ingredient, index > 0 && styles.divider]}
                    >
                      <View style={[styles.box, isGathered && styles.boxChecked]}>
                        {isGathered ? (
                          <Feather name="check" size={18} color={theme.colors.onPrimary} />
                        ) : null}
                      </View>
                      <Text style={[styles.amount, isGathered && styles.done]}>
                        {amount ? formatAmount(amount) : ""}
                      </Text>
                      <Text style={[styles.ingredientLabel, isGathered && styles.done]}>
                        {ingredient.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : isEnd ? (
          <View style={styles.end}>
            <RecipeBanner recipeId={recipe.id} photoPath={newPhotoPath ?? recipe.photoPath} />
            <Text style={styles.title} accessibilityRole="header">
              Bon appétit !
            </Text>
            <Text style={styles.muted}>
              {photoState === "sent"
                ? "La photo illustre maintenant la recette."
                : "Une photo du plat ? Elle illustrera la recette dans le carnet."}
            </Text>
            {photoError ? (
              <Text
                style={styles.error}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {photoError}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.step} accessibilityLiveRegion="polite">
            <Text style={styles.kicker}>
              Étape {page} sur {stepCount}
            </Text>
            <Text style={styles.stepText}>{recipe.steps.at(page - 1)}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isEnd ? (
          <>
            {recipe.groupId && photoState !== "sent" ? (
              <PrimaryButton
                label="Prendre le plat en photo"
                onPress={handleTakePhoto}
                isLoading={photoState === "sending"}
              />
            ) : null}
            <TextButton label="Terminer" onPress={() => router.back()} />
          </>
        ) : (
          <View style={styles.nav}>
            <Pressable
              onPress={() => (page === 0 ? router.back() : goTo(page - 1))}
              accessibilityRole="button"
              accessibilityLabel={page === 0 ? "Quitter le mode cuisine" : "Étape précédente"}
              style={({ pressed }) => [styles.navButton, styles.navBack, pressed && styles.pressed]}
            >
              <Feather
                name={page === 0 ? "x" : "chevron-left"}
                size={28}
                color={theme.colors.chipText}
              />
            </Pressable>
            <Pressable
              onPress={() => goTo(page + 1)}
              accessibilityRole="button"
              accessibilityLabel={
                isIngredients ? "Commencer" : page === stepCount ? "Terminer" : "Étape suivante"
              }
              style={({ pressed }) => [styles.navButton, styles.navNext, pressed && styles.pressed]}
            >
              <Text style={styles.navNextText}>
                {isIngredients ? "C’est parti" : page === stepCount ? "C’est prêt" : "Suivant"}
              </Text>
              <Feather name="chevron-right" size={28} color={theme.colors.onPrimary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    progressRow: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
    },
    progress: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
    progressDone: { backgroundColor: colors.primary },
    content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
    kicker: { color: colors.textMuted, fontSize: fontSize.body, fontWeight: "600" },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 24 },
    card: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: cardShadow },
    ingredient: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    box: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    amount: { width: 96, color: colors.chipText, fontSize: fontSize.body, fontWeight: "700" },
    ingredientLabel: { flex: 1, color: colors.text, fontSize: fontSize.button },
    // Sorti : atténué, jamais barré (barré se lit « retiré, je n'en veux pas »).
    done: { color: colors.textMuted },
    // Lisible à un bras de distance, téléphone posé sur le plan de travail.
    step: { flex: 1, justifyContent: "center", gap: spacing.lg },
    stepText: { color: colors.text, fontSize: 28, lineHeight: 40, fontWeight: "500" },
    end: { flex: 1, justifyContent: "center", gap: spacing.lg },
    error: { color: colors.danger, fontSize: fontSize.small },
    footer: { paddingHorizontal: spacing.xl, gap: spacing.sm },
    nav: { flexDirection: "row", gap: spacing.md },
    navButton: {
      height: 72,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: spacing.sm,
    },
    navBack: { width: 72, backgroundColor: colors.chipBg },
    navNext: { flex: 1, backgroundColor: colors.primary },
    navNextText: { color: colors.onPrimary, fontSize: fontSize.button, fontWeight: "700" },
    pressed: { opacity: 0.7 },
  });
}
