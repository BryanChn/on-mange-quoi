import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { CategoryIcon } from "@/components/category-icon";
import { RECIPE_BUCKET } from "@/lib/photo-storage";
import { recipeTileIndex, type RecipeCategory } from "@/lib/recipe-rules";
import { usePhotoUrl } from "@/lib/use-photo-url";
import { useTheme } from "@/theme";

type RecipeTileProps = {
  recipeId: string;
  photoPath?: string | null;
  // Largeur ; la hauteur suit aspectRatio (carré par défaut).
  size?: number;
  // 4/3 : une vraie photo de plat (« Souvent cuisiné »), plutôt qu'une pastille.
  aspectRatio?: number;
  // Le type de plat : un badge sur le coin, pour reconnaître le plat sans lire.
  category?: RecipeCategory | null;
};

// Vignette d'une recette : sa photo, ou une couleur des avatars (les mêmes en clair et en
// sombre, avec l'icône espresso dessus), toujours la même pour une recette. Décorative : le
// nom est écrit à côté.
export function RecipeTile({
  recipeId,
  photoPath,
  size = 40,
  aspectRatio = 1,
  category = null,
}: RecipeTileProps) {
  const { avatarColors, onAvatar, radius, colors } = useTheme();
  const photoUrl = usePhotoUrl(photoPath, RECIPE_BUCKET);
  const backgroundColor = avatarColors[recipeTileIndex(recipeId, avatarColors.length)];
  // Le badge grandit un peu avec la vignette, sans manger la photo.
  const badge = size >= 100 ? 28 : 20;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size / aspectRatio,
            // Pastille arrondie en petit ; en grand, le coin d'une carte.
            borderRadius: aspectRatio === 1 ? Math.min(size * 0.3, radius.md) : radius.md,
            backgroundColor,
          },
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
          <Feather name="book-open" size={Math.min(size * 0.5, 40)} color={onAvatar} />
        )}
      </View>
      {category ? (
        <View
          style={[
            styles.badge,
            {
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              // En grand, le badge reste dans la photo ; en petit, il déborde sur le coin.
              right: size >= 100 ? 6 : -4,
              bottom: size >= 100 ? 6 : -4,
              backgroundColor: colors.surface,
              borderColor: colors.surface,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <CategoryIcon category={category} size={badge * 0.65} />
        </View>
      ) : null}
    </View>
  );
}

type RecipeBannerProps = {
  recipeId: string;
  photoPath?: string | null;
  // Une photo choisie, pas encore envoyée (aperçu en écrivant la recette).
  uri?: string;
  // hero : en tête de la recette, d'un bord à l'autre de l'écran, sans coins (refonte v4).
  isHero?: boolean;
};

// L'encart en tête d'une recette, pour illustrer le plat : sa photo, ou par défaut le livre sur
// la couleur de la recette (la même que sa vignette dans le carnet). Décoratif.
export function RecipeBanner({ recipeId, photoPath, uri, isHero = false }: RecipeBannerProps) {
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
      style={[
        styles.banner,
        isHero ? styles.hero : { borderRadius: radius.lg },
        { backgroundColor },
      ]}
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
  wrap: { position: "relative" },
  badge: { position: "absolute", alignItems: "center", justifyContent: "center", borderWidth: 2 },
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
  banner: {
    width: "100%",
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  hero: { aspectRatio: 16 / 10 },
});
