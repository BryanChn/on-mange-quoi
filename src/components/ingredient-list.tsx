import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatAmount, scaleAmount } from "@/lib/recipe-rules";
import type { RecipeIngredient } from "@/lib/recipes";
import { useTheme, type Theme } from "@/theme";

type IngredientListProps = {
  ingredients: Pick<RecipeIngredient, "label" | "quantity" | "unit">[];
  // Les parts de la recette, et celles choisies à l'écran : les quantités suivent.
  recipeServings: number;
  servings: number;
  // large : lisible à un bras de distance (mode cuisine).
  isLarge?: boolean;
};

// Les ingrédients d'une recette en liste groupée : la quantité en tomate, le nom à côté.
// Une seule liste pour la recette, le mode cuisine et sa feuille d'ingrédients.
export function IngredientList({
  ingredients,
  recipeServings,
  servings,
  isLarge = false,
}: IngredientListProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      {ingredients.map((ingredient, index) => {
        const amount = scaleAmount(ingredient.quantity, ingredient.unit, recipeServings, servings);
        const amountText = amount ? formatAmount(amount) : "";
        return (
          <View
            key={index}
            style={[styles.row, index > 0 && styles.divider]}
            accessible
            accessibilityLabel={`${amountText ? `${amountText} ` : ""}${ingredient.label}`}
          >
            <Text style={styles.amount}>{amountText}</Text>
            <Text style={[styles.label, isLarge && styles.labelLarge]}>{ingredient.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    card: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: cardShadow },
    row: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    amount: { width: 80, color: colors.chipText, fontSize: fontSize.body, fontWeight: "700" },
    label: { flex: 1, color: colors.text, fontSize: fontSize.body },
    labelLarge: { fontSize: fontSize.cardTitle },
  });
}
