import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import type { RecipeCategory } from "@/lib/recipe-rules";
import { useTheme, type Theme } from "@/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ICONS: Record<RecipeCategory, IconName> = {
  viande: "food-steak",
  poisson: "fish",
  vege: "leaf",
  dessert: "cupcake",
};

export function categoryColor(category: RecipeCategory, colors: Theme["colors"]): string {
  const byCategory: Record<RecipeCategory, string> = {
    viande: colors.categoryViande,
    poisson: colors.categoryPoisson,
    vege: colors.categoryVege,
    dessert: colors.categoryDessert,
  };
  return byCategory[category];
}

type CategoryIconProps = {
  category: RecipeCategory;
  size?: number;
  // Une autre couleur que celle du type (sur une chip active, par exemple).
  color?: string;
};

// L'icône d'un type de plat (line icon de MaterialCommunityIcons, déjà dans l'APK), dans sa
// teinte. Décorative : le nom du type est toujours écrit à côté ou lu par le lecteur d'écran.
export function CategoryIcon({ category, size = 16, color }: CategoryIconProps) {
  const { colors } = useTheme();
  return (
    <MaterialCommunityIcons
      name={ICONS[category]}
      size={size}
      color={color ?? categoryColor(category, colors)}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
