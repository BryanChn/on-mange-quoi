import { StyleSheet, Text } from "react-native";

import type { ShoppingAisle } from "@/lib/shopping-rules";

// Un emoji par rayon, « indispensable » compris (validé le 27/11 : plus parlant que des
// icônes d'une seule teinte, on repère le rayon à sa couleur). Contenu d'étiquette, pas une
// icône de navigation. Le dessin varie un peu selon le téléphone (Android, iPhone).
const EMOJIS: Record<ShoppingAisle | "important", string> = {
  important: "⭐",
  fruits_legumes: "🥕",
  boulangerie: "🥖",
  boucherie_poisson: "🥩",
  charcuterie_traiteur: "🥓",
  cremerie: "🧀",
  epicerie_salee: "🍝",
  epicerie_sucree: "🍫",
  surgeles: "❄️",
  boissons: "🧃",
  bebe: "🍼",
  animaux: "🐾",
  maison_hygiene: "🧴",
  autres: "🛒",
};

// Décoratif : le nom du rayon est toujours écrit à côté.
export function AisleIcon({
  aisle,
  size = 18,
}: {
  aisle: ShoppingAisle | "important";
  size?: number;
}) {
  return (
    <Text
      style={[styles.emoji, { fontSize: size, lineHeight: Math.round(size * 1.25) }]}
      accessible={false}
      importantForAccessibility="no"
    >
      {EMOJIS[aisle]}
    </Text>
  );
}

const styles = StyleSheet.create({
  // Sans couleur imposée : l'emoji garde la sienne.
  emoji: { textAlign: "center" },
});
