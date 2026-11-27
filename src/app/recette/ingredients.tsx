import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { IngredientList } from "@/components/ingredient-list";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { servingsLabel } from "@/lib/recipe-rules";
import { fetchRecipe, type Recipe } from "@/lib/recipes";
import { loadErrorMessage } from "@/lib/network-errors";
import { useSheetBottomInset } from "@/lib/use-sheet-bottom-inset";
import { useTheme, type Theme } from "@/theme";

// La feuille des ingrédients, ouverte depuis une étape du mode cuisine (feuille native :
// on la ferme en la faisant glisser, l'étape reste derrière). Refonte v4 : remplace le
// panneau fait main (Modal), qui n'avait ni le geste ni l'accessibilité du système.
export default function IngredientsSheet() {
  const { id, servings: servingsParam } = useLocalSearchParams<{ id: string; servings?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const bottomInset = useSheetBottomInset();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    fetchRecipe(id).then(setRecipe, setLoadError);
  }, [id]);

  function retry() {
    setLoadError(null);
    load();
  }

  // La recette vient du serveur (un système extérieur) : chargée à l'ouverture de la feuille.
  useEffect(() => {
    load();
  }, [load]);

  if (loadError && !recipe) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir les ingrédients"
        message={loadErrorMessage(loadError)}
        onRetry={retry}
      />
    );
  }
  if (!recipe) return <LoadingScreen />;

  const servings = Math.min(20, Math.max(1, Number(servingsParam) || recipe.servings));

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + theme.spacing.xl }]}
    >
      <Text style={styles.title} accessibilityRole="header">
        Ingrédients · {servingsLabel(servings)}
      </Text>
      <IngredientList
        ingredients={recipe.ingredients}
        recipeServings={recipe.servings}
        servings={servings}
        isLarge
      />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
  });
}
