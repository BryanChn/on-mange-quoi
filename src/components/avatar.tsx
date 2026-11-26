import { Image } from "expo-image";
import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";

import {
  AVATAR_BACKGROUNDS,
  getInitial,
  pickAvatarColor,
  toAvatarId,
  type AvatarId,
} from "@/lib/avatar";
import { colorTransition } from "@/lib/motion";
import { usePhotoUrl } from "@/lib/use-photo-url";
import { useTheme, type Theme } from "@/theme";

// require statiques : Metro doit voir chaque fichier pour l'embarquer dans la mise à jour.
const AVATAR_IMAGES: Record<AvatarId, number> = {
  chat: require("@/assets/images/avatars/chat.svg"),
  spaghetti: require("@/assets/images/avatars/spaghetti.svg"),
  pizza: require("@/assets/images/avatars/pizza.svg"),
  burger: require("@/assets/images/avatars/burger.svg"),
  avocat: require("@/assets/images/avatars/avocat.svg"),
  ramen: require("@/assets/images/avatars/ramen.svg"),
};

type AvatarProps = {
  name: string;
  // Avatar prédéfini tel qu'en base ; absent, inconnu ou null : l'initiale.
  avatar?: string | null;
  size?: number;
  // En attente (n'a pas encore voté). Initiale : rond vide en pointillé. Avatar choisi :
  // le dessin estompé, en pointillé, pour qu'on reconnaisse quand même qui on attend.
  isPending?: boolean;
  // Photo perso (chemin dans le stockage) : prioritaire sur l'avatar dessiné et l'initiale.
  photoPath?: string | null;
};

// Décoratif : le nom est toujours écrit à côté, un lecteur d'écran n'a rien à lire ici.
export function Avatar({ name, avatar, size = 32, isPending = false, photoPath }: AvatarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const avatarId = toAvatarId(avatar);
  const photoUrl = usePhotoUrl(photoPath);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const fill = avatarId ? AVATAR_BACKGROUNDS[avatarId] : pickAvatarColor(name, theme.avatarColors);

  // Mêmes propriétés dans les deux états (contour de 2, invisible quand il est plein) :
  // seules les couleurs changent, et elles passent en transition quand un membre vote.
  const stateStyle = isPending
    ? avatarId
      ? [styles.pending, styles.pendingPicture, { backgroundColor: fill }]
      : styles.pending
    : { backgroundColor: fill, borderColor: fill };

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, shape, colorTransition, stateStyle]}
    >
      {photoUrl ? (
        // cacheKey : le chemin, stable, et non le lien temporaire, qui change toutes les heures.
        <Image
          source={{ uri: photoUrl, cacheKey: photoPath ?? undefined }}
          style={[styles.picture, isPending && styles.pendingPicture]}
          contentFit="cover"
          transition={150}
        />
      ) : avatarId ? (
        <Image source={AVATAR_IMAGES[avatarId]} style={styles.picture} contentFit="contain" />
      ) : (
        <Text
          style={[styles.initial, { fontSize: size * 0.4 }, isPending && styles.initialPending]}
        >
          {getInitial(name)}
        </Text>
      )}
    </Animated.View>
  );
}

function createStyles({ colors, onAvatar }: Theme) {
  return StyleSheet.create({
    avatar: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      overflow: "hidden",
    },
    pending: {
      borderStyle: "dashed",
      borderColor: colors.textMuted,
      backgroundColor: "transparent",
    },
    pendingPicture: { opacity: 0.45 },
    picture: { width: "100%", height: "100%" },
    initial: { color: onAvatar, fontWeight: "700" },
    initialPending: { color: colors.textMuted },
  });
}
