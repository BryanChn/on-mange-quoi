import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryIcon } from "@/components/category-icon";
import { FilterChip } from "@/components/filter-chip";
import { HeaderButton } from "@/components/header-button";
import { ListCard, ListRow } from "@/components/list";
import { RecipeTile } from "@/components/recipe-tile";
import { SearchField } from "@/components/search-field";
import { TextButton } from "@/components/text-button";
import { Section } from "@/components/section";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { fetchGroup } from "@/lib/groups";
import { loadErrorMessage } from "@/lib/network-errors";
import {
  cookedLabel,
  CATEGORY_LABELS,
  hasRecipeFilters,
  matchesRecipeFilters,
  matchesRecipeSearch,
  NO_RECIPE_FILTERS,
  RECIPE_CATEGORIES,
  recipeListSubtitle,
  type RecipeFilters,
  oftenCooked,
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
  const [filters, setFilters] = useState<RecipeFilters>(NO_RECIPE_FILTERS);

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

  // La recherche et les filtres s'ajoutent : « végé », « rapide », et « curry » dans le nom.
  const matches = (recipe: RecipeSummary) =>
    matchesRecipeSearch(recipe.title, query) && matchesRecipeFilters(recipe, filters);
  const shown = carnet.recipes.filter(matches);
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

  const isFiltering = query.trim() !== "" || hasRecipeFilters(filters);
  // Filtrées : les idées qui correspondent et pas encore dans le carnet (elles y sont déjà
  // listées) ; sinon repliées à trois.
  const matchingIdeas = carnet.baseRecipes.filter(
    (recipe) => matches(recipe) && !copies.has(recipe.id),
  );
  // Repliées : d'abord les idées pas encore dans le carnet, une idée déjà copiée n'en est plus une.
  const ideasByNovelty = [
    ...carnet.baseRecipes.filter((recipe) => !copies.has(recipe.id)),
    ...carnet.baseRecipes.filter((recipe) => copies.has(recipe.id)),
  ];
  const ideas = isFiltering || showAllIdeas ? matchingIdeas : ideasByNovelty.slice(0, IDEAS_FOLDED);
  const hiddenIdeas = isFiltering ? 0 : carnet.baseRecipes.length - IDEAS_FOLDED;
  const hasNoMatch = isFiltering && shown.length === 0 && matchingIdeas.length === 0;

  function toggleCategory(category: RecipeFilters["category"]) {
    setFilters((current) => ({
      ...current,
      category: current.category === category ? null : category,
    }));
  }

  // La ligne d'une recette : badge du type sur la vignette, durée, budget et régime dessous.
  function recipeRow(recipe: RecipeSummary, subtitle: string, targetId: string) {
    const type = recipe.category ? `, ${CATEGORY_LABELS[recipe.category]}` : "";
    return (
      <ListRow
        key={recipe.id}
        label={recipe.title}
        subtitle={subtitle}
        accessibilityLabel={`${recipe.title}${type}, ${subtitle}`}
        leading={
          <RecipeTile
            recipeId={recipe.id}
            photoPath={recipe.photoPath}
            category={recipe.category}
            size={44}
          />
        }
        hasChevron
        onPress={() => openRecipe(targetId)}
      />
    );
  }

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

        {/* Les filtres : un type de plat à la fois, puis rapide et petit budget qui s'ajoutent. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.bleed, styles.filtersScroll]}
          contentContainerStyle={styles.filters}
          accessibilityLabel="Filtrer les recettes"
        >
          {RECIPE_CATEGORIES.map((category) => (
            <FilterChip
              key={category}
              label={CATEGORY_LABELS[category]}
              isSelected={filters.category === category}
              onPress={() => toggleCategory(category)}
              icon={(color) => <CategoryIcon category={category} size={16} color={color} />}
            />
          ))}
          <View style={styles.filtersDivider} />
          <FilterChip
            label="≤ 30 min"
            isSelected={filters.isQuick}
            onPress={() => setFilters((current) => ({ ...current, isQuick: !current.isQuick }))}
          />
          <FilterChip
            label="Petit budget"
            isSelected={filters.isCheap}
            onPress={() => setFilters((current) => ({ ...current, isCheap: !current.isCheap }))}
          />
        </ScrollView>

        {cooked.length > 0 && !isFiltering ? (
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
                    category={recipe.category}
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
        ) : hasNoMatch ? (
          // Rien ne correspond : on le dit, et on propose d'élargir.
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aucune recette</Text>
            <Text style={styles.emptyText}>
              Rien ne correspond à ces filtres. Retire-en un, ou écris cette recette.
            </Text>
            <View style={styles.emptyAction}>
              <TextButton
                label="Retirer les filtres"
                onPress={() => {
                  setFilters(NO_RECIPE_FILTERS);
                  setQuery("");
                }}
              />
            </View>
          </View>
        ) : shown.length > 0 ? (
          <Section title={`Notre carnet · ${isFiltering ? shown.length : carnet.recipes.length}`}>
            <ListCard>
              {shown.map((recipe) => recipeRow(recipe, recipeListSubtitle(recipe), recipe.id))}
            </ListCard>
          </Section>
        ) : null}

        {ideas.length > 0 ? (
          <Section
            title={isFiltering ? `Des idées · ${ideas.length}` : "Des idées pour commencer"}
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
                return recipeRow(
                  recipe,
                  copyId ? "Déjà dans le carnet" : recipeListSubtitle(recipe),
                  copyId ?? recipe.id,
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
    emptyAction: { alignItems: "flex-start", marginLeft: -spacing.sm },
    // Une rangée à sa hauteur : sans flexGrow 0, le ScrollView horizontal s'étirait en hauteur.
    filtersScroll: { flexGrow: 0 },
    filters: { alignItems: "center", gap: spacing.xs + 2, paddingHorizontal: spacing.lg },
    filtersDivider: {
      width: StyleSheet.hairlineWidth,
      height: 20,
      marginHorizontal: 2,
      backgroundColor: colors.border,
    },
  });
}
