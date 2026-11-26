import { Feather } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { recipeTileIndex } from "@/lib/recipe-rules";
import { useTheme } from "@/theme";

// Vignette d'une recette sans photo : une couleur des avatars (les mêmes en clair et en
// sombre, avec l'icône espresso dessus), toujours la même pour une recette.
export function RecipeTile({ recipeId, size = 40 }: { recipeId: string; size?: number }) {
  const { avatarColors, onAvatar } = useTheme();
  const backgroundColor = avatarColors[recipeTileIndex(recipeId, avatarColors.length)];

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.35, backgroundColor },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Feather name="book-open" size={size * 0.5} color={onAvatar} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
