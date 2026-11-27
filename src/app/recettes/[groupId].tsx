import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderButton } from "@/components/header-button";
import { ListCard, ListRow } from "@/components/list";
import { RecipeTile } from "@/components/recipe-tile";
import { SearchField } from "@/components/search-field";
import { Section } from "@/components/section";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { fetchGroup } from "@/lib/groups";
import { loadErrorMessage } from "@/lib/network-errors";
import {
  cookedLabel,
  matchesRecipeSearch,
  oftenCooked,
  recipeSubtitle,
  type CookedCount,
} from "@/lib/recipe-rules";
import {
  fetchBaseRecipes,
  fetchCarnet,
  fetchCookedWinners,
  subscribeToCarnet,
  type RecipeSummary,
} from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

type CarnetState = {
  groupName: string;
  recipes: RecipeSummary[];
  baseRecipes: RecipeSummary[];
  cooked: CookedCount[];
};

// Au-delà, la recherche aide ; en dessous, tout tient à l'écran.
const SEARCH_FROM = 6;
// Les idées repliées : trois suffisent pour donner envie, « Voir tout » montre le reste.
const IDEAS_FOLDED = 3;
// « Souvent cuisiné » : une rangée qu'on fait glisser, pas plus de six vignettes.
const COOKED_MAX = 6;
// Largeur d'une vignette de « Souvent cuisiné » (photo 4:3) : la troisième dépasse du bord.
const COOKED_WIDTH = 148;

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
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [showAllIdeas, setShowAllIdeas] = useState(false);

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);

  const load = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    Promise.all([
      fetchGroup(groupId),
      fetchCarnet(groupId),
      fetchBaseRecipes(),
      fetchCookedWinners(groupId),
    ]).then(
      ([group, recipes, baseRecipes, winners]) => {
        if (latestRequestRef.current !== requestId) return;
        setCarnet({
          groupName: group.name,
          recipes,
          baseRecipes,
          cooked: oftenCooked(winners, COOKED_MAX),
        });
        setHasFailed(false);
      },
      (error: unknown) => {
        if (latestRequestRef.current !== requestId) return;
        setLoadError(error);
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
        message={loadErrorMessage(loadError)}
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

  // Une recette retirée du carnet ne reste pas dans « Souvent cuisiné ».
  const byId = new Map(carnet.recipes.map((recipe) => [recipe.id, recipe]));
  const cooked = carnet.cooked.flatMap(({ recipeId, count }) => {
    const recipe = byId.get(recipeId);
    return recipe ? [{ recipe, count }] : [];
  });

  function openRecipe(recipeId: string) {
    router.push({ pathname: "/recette/[id]", params: { id: recipeId, groupId } });
  }

  const isSearching = query.trim() !== "";
  const ideas = showAllIdeas ? carnet.baseRecipes : carnet.baseRecipes.slice(0, IDEAS_FOLDED);
  const hiddenIdeas = carnet.baseRecipes.length - IDEAS_FOLDED;

  return (
    <>
      {/* « Écrire » dans l'en-tête : l'action reste à portée sans pousser le carnet vers le bas. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderButton
              label="Écrire"
              icon="plus"
              onPress={() => router.push({ pathname: "/recette/ecrire", params: { groupId } })}
            />
          ),
        }}
      />
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

        {carnet.recipes.length >= SEARCH_FROM ? (
          <SearchField value={query} onChangeText={setQuery} placeholder="Chercher une recette" />
        ) : null}

        {cooked.length > 0 && !isSearching ? (
          <Section title="Souvent cuisiné">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={styles.cookedRow}
            >
              {cooked.map(({ recipe, count }) => (
                <Pressable
                  key={recipe.id}
                  onPress={() => openRecipe(recipe.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${recipe.title}, ${cookedLabel(count)}`}
                  style={({ pressed }) => [styles.cookedTile, pressed && styles.pressed]}
                >
                  <RecipeTile
                    recipeId={recipe.id}
                    photoPath={recipe.photoPath}
                    size={COOKED_WIDTH}
                    aspectRatio={4 / 3}
                  />
                  <Text style={styles.cookedTitle} numberOfLines={2}>
                    {recipe.title}
                  </Text>
                  <Text style={styles.subtitle}>{cookedLabel(count)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {carnet.recipes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Le carnet est vide</Text>
            <Text style={styles.emptyText}>
              Les recettes écrites ici, tout {carnet.groupName} les voit et peut les modifier. Écris
              la première, ou pars d’une idée ci-dessous.
            </Text>
          </View>
        ) : (
          <Section title={`Notre carnet · ${carnet.recipes.length}`}>
            {shown.length === 0 ? (
              <Text style={styles.emptyText}>Aucune recette ne s’appelle comme ça.</Text>
            ) : (
              <ListCard>
                {shown.map((recipe) => (
                  <ListRow
                    key={recipe.id}
                    label={recipe.title}
                    subtitle={recipeSubtitle(recipe.servings, recipe.ingredientCount)}
                    leading={<RecipeTile recipeId={recipe.id} photoPath={recipe.photoPath} />}
                    hasChevron
                    onPress={() => openRecipe(recipe.id)}
                  />
                ))}
              </ListCard>
            )}
          </Section>
        )}

        {carnet.baseRecipes.length > 0 && !isSearching ? (
          <Section
            title="Des idées pour commencer"
            action={
              hiddenIdeas > 0
                ? {
                    label: showAllIdeas ? "Replier" : `Voir tout · ${carnet.baseRecipes.length}`,
                    onPress: () => setShowAllIdeas((value) => !value),
                  }
                : undefined
            }
            footnote="Écrites pour l’app. Ajoute-les à ton carnet, puis modifie-les comme tu veux."
          >
            <ListCard>
              {ideas.map((recipe) => {
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
                    leading={<RecipeTile recipeId={recipe.id} photoPath={recipe.photoPath} />}
                    hasChevron
                    onPress={() => openRecipe(copyId ?? recipe.id)}
                  />
                );
              })}
            </ListCard>
          </Section>
        ) : null}
      </ScrollView>
    </>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.xl,
    },
    header: { gap: spacing.xs },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    subtitle: { color: colors.textMuted, fontSize: fontSize.caption },
    // La rangée déborde jusqu'aux bords de l'écran : la vignette suivante dépasse.
    bleed: { marginHorizontal: -spacing.lg },
    cookedRow: { gap: spacing.md, paddingHorizontal: spacing.lg },
    cookedTile: { width: COOKED_WIDTH, gap: spacing.xs },
    cookedTitle: {
      marginTop: spacing.xs,
      color: colors.text,
      fontSize: fontSize.body - 1,
      fontWeight: "600",
      lineHeight: 20,
    },
    pressed: { opacity: 0.6 },
    empty: { gap: spacing.xs, paddingHorizontal: spacing.xs },
    emptyTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.cardTitle },
    emptyText: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 24 },
  });
}
