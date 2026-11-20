import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";

import { getInitial, pickAvatarColor } from "@/lib/avatar";
import { colorTransition } from "@/lib/motion";
import { useTheme, type Theme } from "@/theme";

type AvatarProps = {
  name: string;
  size?: number;
  // En attente (n'a pas encore voté) : rond vide en pointillé, au lieu d'un rond plein.
  isPending?: boolean;
};

// Décoratif : le nom est toujours écrit à côté, un lecteur d'écran n'a pas à lire l'initiale.
export function Avatar({ name, size = 32, isPending = false }: AvatarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const fill = pickAvatarColor(name, theme.avatarColors);

  // Mêmes propriétés dans les deux états (contour de 2, invisible quand il est plein) :
  // seules les couleurs changent, et elles passent en transition quand un membre vote.
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        shape,
        colorTransition,
        isPending ? styles.pending : { backgroundColor: fill, borderColor: fill },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }, isPending && styles.initialPending]}>
        {getInitial(name)}
      </Text>
    </Animated.View>
  );
}

function createStyles({ colors, onAvatar }: Theme) {
  return StyleSheet.create({
    avatar: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
    pending: {
      borderStyle: "dashed",
      borderColor: colors.textMuted,
      backgroundColor: "transparent",
    },
    initial: { color: onAvatar, fontWeight: "700" },
    initialPending: { color: colors.textMuted },
  });
}
