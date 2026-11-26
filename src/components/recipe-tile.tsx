import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { RECIPE_BUCKET } from "@/lib/photo-storage";
import { recipeTileIndex } from "@/lib/recipe-rules";
import { usePhotoUrl } from "@/lib/use-photo-url";
import { useTheme } from "@/theme";

type RecipeTileProps = { recipeId: string; photoPath?: string | null; size?: number };

// Vignette d'une recette : sa photo, ou une couleur des avatars (les mêmes en clair et en
// sombre, avec l'icône espresso dessus), toujours la même pour une recette. Décorative : le
// nom est écrit à côté.
export function RecipeTile({ recipeId, photoPath, size = 40 }: RecipeTileProps) {
  const { avatarColors, onAvatar } = useTheme();
  const photoUrl = usePhotoUrl(photoPath, RECIPE_BUCKET);
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
      {photoUrl ? (
        // cacheKey : le chemin, stable, et non le lien temporaire, qui change toutes les heures.
        <Image
          source={{ uri: photoUrl, cacheKey: photoPath ?? undefined }}
          style={styles.fill}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Feather name="book-open" size={size * 0.5} color={onAvatar} />
      )}
    </View>
  );
}

type RecipeBannerProps = {
  recipeId: string;
  photoPath?: string | null;
  // Une photo choisie, pas encore envoyée (aperçu en écrivant la recette).
  uri?: string;
};

// L'encart en tête d'une recette, pour illustrer le plat : sa photo, ou par défaut le livre sur
// la couleur de la recette (la même que sa vignette dans le carnet). Décoratif.
export function RecipeBanner({ recipeId, photoPath, uri }: RecipeBannerProps) {
  const { avatarColors, onAvatar, radius } = useTheme();
  const photoUrl = usePhotoUrl(uri ? null : photoPath, RECIPE_BUCKET);
  const source = uri
    ? { uri }
    : photoUrl
      ? { uri: photoUrl, cacheKey: photoPath ?? undefined }
      : null;
  const backgroundColor = avatarColors[recipeTileIndex(recipeId, avatarColors.length)];

  return (
    <View
      style={[styles.banner, { borderRadius: radius.lg, backgroundColor }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {source ? (
        <Image source={source} style={styles.fill} contentFit="cover" transition={150} />
      ) : (
        <Feather name="book-open" size={56} color={onAvatar} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
  banner: {
    width: "100%",
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
