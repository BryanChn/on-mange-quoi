import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getInitial, pickAvatarColor } from "@/lib/avatar";
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

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        shape,
        isPending ? styles.pending : { backgroundColor: pickAvatarColor(name, theme.avatarColors) },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }, isPending && styles.initialPending]}>
        {getInitial(name)}
      </Text>
    </View>
  );
}

function createStyles({ colors, onAvatar }: Theme) {
  return StyleSheet.create({
    avatar: { alignItems: "center", justifyContent: "center" },
    pending: { borderWidth: 2, borderStyle: "dashed", borderColor: colors.textMuted },
    initial: { color: onAvatar, fontWeight: "700" },
    initialPending: { color: colors.textMuted },
  });
}
