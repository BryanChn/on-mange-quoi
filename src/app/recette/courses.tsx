import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { Section } from "@/components/section";
import { ServingsStepper } from "@/components/servings-stepper";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { fetchGroup } from "@/lib/groups";
import { hapticAdded, hapticReject, hapticToggle } from "@/lib/haptics";
import { formatAmount, scaleAmount } from "@/lib/recipe-rules";
import { fetchRecipe, type Recipe } from "@/lib/recipes";
import { addRecipeToShopping, fetchShoppingList } from "@/lib/shopping";
import { findDuplicate, planShoppingAdditions, type ShoppingItem } from "@/lib/shopping-rules";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

type Loaded = { recipe: Recipe; groupName: string; memberCount: number; items: ShoppingItem[] };

// « Ajouter aux courses » depuis une recette du carnet (maquette du 26/11, écran 6) : les
// ingrédients pour les parts du foyer (par défaut, une par membre), tous cochés ; on décoche ce
// qu'on a ; ce qui est déjà sur la liste n'est pas ajouté deux fois. La liste est celle du foyer
// de la recette : pas de choix à faire.
export default function RecipeToShoppingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  // null : une part par membre du foyer.
  const [chosenServings, setChosenServings] = useState<number | null>(null);
  // Les lignes décochées (« je l'ai déjà »), par position dans la recette.
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Après l'ajout : combien d'articles sont partis.
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchRecipe(id)
      .then(async (recipe) => {
        if (!recipe.groupId) throw new Error("Recette de base : pas de liste de courses.");
        const [group, items] = await Promise.all([
          fetchGroup(recipe.groupId),
          fetchShoppingList(recipe.groupId),
        ]);
        setLoaded({ recipe, groupName: group.name, memberCount: group.members.length, items });
        setHasFailed(false);
      })
      .catch((error: unknown) => {
        setLoadError(error);
        setHasFailed(true);
      });
  }, [id]);

  // La recette, le foyer et sa liste viennent du serveur (un système extérieur) : une fois.
  useEffect(() => {
    load();
  }, [load]);

  if (hasFailed && !loaded) {
    return (
      <ErrorScreen
        title="On n’arrive pas à préparer les courses"
        message={loadErrorMessage(loadError)}
        onRetry={load}
      />
    );
  }
  if (!loaded) return <LoadingScreen />;

  const { recipe, groupName, memberCount, items } = loaded;
  // Toujours posé ici : load refuse une recette de base.
  const groupId = recipe.groupId ?? "";
  const servings = chosenServings ?? Math.max(1, memberCount);

  const rows = recipe.ingredients.map((ingredient, index) => {
    const amount = scaleAmount(
      ingredient.quantity,
      ingredient.unit,
      recipe.servings,
      servings,
      "courses",
    );
    const duplicate = findDuplicate(items, ingredient.label);
    // Déjà à acheter : rien à ajouter, la ligne le dit et ne se coche pas.
    const isOnList = duplicate !== null && duplicate.checkedAt === null;
    return {
      index,
      label: ingredient.label,
      foodId: ingredient.foodId,
      quantity: amount ? formatAmount(amount) : null,
      isOnList,
      isChecked: !isOnList && !unchecked.has(index),
    };
  });
  const plan = planShoppingAdditions(
    rows
      .filter((row) => row.isChecked)
      .map((row) => ({ label: row.label, quantity: row.quantity, foodId: row.foodId })),
    items,
  );
  const count = plan.toInsert.length + plan.toUncheck.length;
  const onListCount = rows.filter((row) => row.isOnList).length;

  function toggle(index: number) {
    const next = new Set(unchecked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    hapticToggle(!next.has(index));
    setUnchecked(next);
  }

  async function handleAdd() {
    if (count === 0 || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      setAddedCount(await addRecipeToShopping(groupId, recipe.id, plan));
      hapticAdded();
    } catch (error) {
      hapticReject();
      setError(failureMessage("Les articles ne sont pas partis", error));
    } finally {
      setIsAdding(false);
    }
  }

  if (addedCount !== null) {
    return (
      <View
        style={[styles.container, styles.done, { paddingBottom: insets.bottom + theme.spacing.xl }]}
      >
        <View style={styles.doneBody}>
          <Feather
            name="check-circle"
            size={40}
            color={theme.colors.success}
            style={styles.centered}
          />
          <Text style={[styles.doneTitle, styles.centeredText]} accessibilityRole="header">
            {addedCount === 1 ? "1 article ajouté" : `${addedCount} articles ajoutés`}
          </Text>
          <Text style={[styles.muted, styles.centeredText]}>
            Dans la liste de courses de {groupName}.
          </Text>
          <PrimaryButton
            label="Voir la liste"
            onPress={() => router.replace({ pathname: "/courses/[groupId]", params: { groupId } })}
          />
          <TextButton label="Retour à la recette" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Ajouter aux courses
        </Text>
        <Text style={styles.muted}>
          {recipe.title} · dans la liste de {groupName}
        </Text>
      </View>

      <View style={styles.section}>
        <ServingsStepper value={servings} onChange={setChosenServings} />
        <Text style={styles.hint}>
          {memberCount <= 1
            ? `1 personne dans ${groupName}.`
            : `${memberCount} personnes dans ${groupName} : une part chacune par défaut.`}
        </Text>
      </View>

      <Section
        title="Décoche ce que tu as"
        footnote={
          onListCount === 0
            ? undefined
            : onListCount === 1
              ? "Un ingrédient est déjà sur la liste : il n’est pas ajouté deux fois."
              : `${onListCount} ingrédients sont déjà sur la liste : ils ne sont pas ajoutés deux fois.`
        }
      >
        <View style={styles.card}>
          {rows.map((row, position) => (
            <Pressable
              key={row.index}
              onPress={() => toggle(row.index)}
              disabled={row.isOnList}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.isChecked, disabled: row.isOnList }}
              accessibilityLabel={`${row.label}${row.quantity ? `, ${row.quantity}` : ""}${row.isOnList ? ", déjà sur la liste" : ""}`}
              style={({ pressed }) => [
                styles.row,
                position > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.box, row.isChecked && styles.boxChecked]}>
                {row.isChecked ? (
                  <Feather name="check" size={16} color={theme.colors.onPrimary} />
                ) : null}
              </View>
              <Text style={[styles.rowName, !row.isChecked && styles.rowMuted]}>{row.label}</Text>
              <Text style={[styles.rowQuantity, !row.isChecked && styles.rowMuted]}>
                {row.isOnList ? "déjà sur la liste" : (row.quantity ?? "")}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={
          count === 0
            ? "Rien à ajouter"
            : count === 1
              ? "Ajouter 1 article"
              : `Ajouter ${count} articles`
        }
        onPress={handleAdd}
        isLoading={isAdding}
        isDisabled={count === 0}
      />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
    done: { justifyContent: "center" },
    doneBody: { gap: spacing.md },
    centered: { alignSelf: "center" },
    centeredText: { textAlign: "center" },
    header: { gap: spacing.xs },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    hint: { marginLeft: spacing.xs, color: colors.textMuted, fontSize: fontSize.caption },
    section: { gap: spacing.md },
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
    pressed: { opacity: 0.6 },
    box: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    rowName: { flex: 1, color: colors.text, fontSize: fontSize.body },
    rowQuantity: { color: colors.chipText, fontSize: fontSize.small, fontWeight: "700" },
    rowMuted: { color: colors.textMuted },
    doneTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
