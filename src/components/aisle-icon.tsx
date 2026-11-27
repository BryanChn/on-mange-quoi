import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import type { ShoppingAisle } from "@/lib/shopping-rules";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Une line icon par rayon (MaterialCommunityIcons, déjà dans l'APK), « indispensable » compris.
const ICONS: Record<ShoppingAisle | "important", IconName> = {
  important: "star",
  fruits_legumes: "carrot",
  boulangerie: "baguette",
  boucherie_poisson: "food-steak",
  charcuterie_traiteur: "sausage",
  cremerie: "cheese",
  epicerie_salee: "pasta",
  epicerie_sucree: "cookie-outline",
  surgeles: "snowflake",
  boissons: "bottle-soda-classic-outline",
  bebe: "baby-bottle-outline",
  animaux: "paw",
  maison_hygiene: "spray-bottle",
  autres: "dots-horizontal",
};

export function AisleIcon({
  aisle,
  size = 18,
  color,
}: {
  aisle: ShoppingAisle | "important";
  size?: number;
  color: string;
}) {
  return (
    <MaterialCommunityIcons
      name={ICONS[aisle]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
