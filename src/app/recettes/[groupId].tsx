import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/card";
import { ListCard, ListRow } from "@/components/list";
import { PrimaryButton } from "@/components/primary-button";
import { RecipeTile } from "@/components/recipe-tile";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextField } from "@/components/text-field";
import { fetchGroup } from "@/lib/groups";
import { matchesRecipeSearch, recipeSubtitle } from "@/lib/recipe-rules";
import {
  fetchBaseRecipes,
  fetchCarnet,
  subscribeToCarnet,
  type RecipeSummary,
} from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

type CarnetState = {
  groupName: string;
  recipes: RecipeSummary[];
  baseRecipes: RecipeSummary[];
};

// Au-delà, la recherche aide ; en dessous, tout tient à l'écran.
const SEARCH_FROM = 6;

// Le carnet de recettes d'un foyer (maquette du 26/11 : https://claude.ai/artifact/8Ei7qPU2mWkKyABtFjBNRw).
// Le carnet de A à Z, puis les recettes de base écrites pour l'app. Tout le foyer le voit
// bouger en direct.
export default function CarnetScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [carnet, setCarnet] = useState<CarnetState | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [query, setQuery] = useState("");

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);

  const load = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    Promise.all([fetchGroup(groupId), fetchCarnet(groupId), fetchBaseRecipes()]).then(
      ([group, recipes, baseRecipes]) => {
        if (latestRequestRef.current !== requestId) return;
        setCarnet({ groupName: group.name, recipes, baseRecipes });
        setHasFailed(false);
      },
      () => {
        if (latestRequestRef.current !== requestId) return;
        setHasFailed(true);
      },
    );
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return subscribeToCarnet(groupId, load);
    }, [groupId, load]),
  );

  if (hasFailed && !carnet) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir le carnet"
        message="Vérifie ta connexion et réessaie."
        onRetry={load}
      />
    );
  }
  if (!carnet) return <LoadingScreen />;

  const shown = carnet.recipes.filter((recipe) => matchesRecipeSearch(recipe.title, query));
  // Une recette de base déjà copiée ouvre sa copie : on ne la copie pas deux fois.
  const copies = new Map(
    carnet.recipes.flatMap((recipe) =>
      recipe.sourceRecipeId ? [[recipe.sourceRecipeId, recipe.id] as const] : [],
    ),
  );

  function openRecipe(recipeId: string) {
    router.push({ pathname: "/recette/[id]", params: { id: recipeId, groupId } });
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Recettes
        </Text>
        <Text style={styles.subtitle}>Le carnet de {carnet.groupName}</Text>
      </View>

      <PrimaryButton
        label="Écrire une recette"
        onPress={() => router.push({ pathname: "/recette/ecrire", params: { groupId } })}
      />

      {carnet.recipes.length >= SEARCH_FROM ? (
        <TextField
          label="Chercher une recette"
          value={query}
          onChangeText={setQuery}
          placeholder="Bolognaise, gratin…"
          returnKeyType="search"
          autoCorrect={false}
        />
      ) : null}

      {carnet.recipes.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>Le carnet est vide</Text>
          <Text style={styles.emptyText}>
            Les recettes écrites ici, tout {carnet.groupName} les voit et peut les modifier.
          </Text>
        </Card>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Notre carnet
          </Text>
          {shown.length === 0 ? (
            <Text style={styles.emptyText}>Aucune recette ne s’appelle comme ça.</Text>
          ) : (
            <ListCard>
              {shown.map((recipe) => (
                <ListRow
                  key={recipe.id}
                  label={recipe.title}
                  subtitle={recipeSubtitle(recipe.servings, recipe.ingredientCount)}
                  leading={<RecipeTile recipeId={recipe.id} />}
                  hasChevron
                  onPress={() => openRecipe(recipe.id)}
                />
              ))}
            </ListCard>
          )}
        </View>
      )}

      {carnet.baseRecipes.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Des idées pour commencer
            </Text>
            <Text style={styles.subtitle}>
              Écrites pour l’app. Ajoute-les, puis modifie-les comme tu veux.
            </Text>
          </View>
          <ListCard>
            {carnet.baseRecipes.map((recipe) => {
              const copyId = copies.get(recipe.id);
              return (
                <ListRow
                  key={recipe.id}
                  label={recipe.title}
                  subtitle={
                    copyId
                      ? "Déjà dans le carnet"
                      : recipeSubtitle(recipe.servings, recipe.ingredientCount)
                  }
                  leading={<RecipeTile recipeId={recipe.id} />}
                  hasChevron
                  onPress={() => openRecipe(copyId ?? recipe.id)}
                />
              );
            })}
          </ListCard>
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    header: { gap: spacing.xs },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    subtitle: { color: colors.textMuted, fontSize: fontSize.small },
    section: { gap: spacing.md },
    sectionHeader: { gap: spacing.xs },
    sectionTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20 },
    emptyTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    emptyText: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 24 },
  });
}
