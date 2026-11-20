import { Feather } from "@expo/vector-icons";
import { useUpdates } from "expo-updates";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { updateBanner } from "@/lib/app-version";
import { restartOnLatestUpdate, useJustUpdated } from "@/lib/updates";
import { useTheme, type Theme } from "@/theme";

// Sur l'accueil seulement : redémarrer en plein vote ferait perdre ce qu'on tape.
// « Téléchargement… » rassure (la mise à jour arrive), « Redémarrer » l'applique tout de
// suite, et « vient d'être mise à jour » dit ce qui s'est passé quand elle s'est appliquée
// toute seule (au lancement, ou au retour après une longue absence).
export function UpdateBanner() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { isDownloading, isUpdatePending } = useUpdates();
  const { justUpdated, dismiss } = useJustUpdated();
  const [isRestarting, setIsRestarting] = useState(false);
  const banner = updateBanner({ isDownloading, isUpdatePending, justUpdated });

  if (banner === null) return null;

  if (banner === "updated") {
    return (
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <Feather name="check-circle" size={18} color={theme.colors.chipText} />
        <Text style={styles.text}>L’app vient d’être mise à jour</Text>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Fermer l’annonce de mise à jour"
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>OK</Text>
        </Pressable>
      </View>
    );
  }

  if (banner === "downloading") {
    return (
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={theme.colors.chipText} />
        <Text style={styles.text}>Téléchargement d’une mise à jour…</Text>
      </View>
    );
  }

  function handleRestart() {
    setIsRestarting(true);
    // Si le redémarrage échoue, la mise à jour s'appliquera au prochain lancement.
    restartOnLatestUpdate().catch(() => setIsRestarting(false));
  }

  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Feather name="download" size={18} color={theme.colors.chipText} />
      <Text style={styles.text}>Nouvelle version prête</Text>
      <Pressable
        onPress={handleRestart}
        disabled={isRestarting}
        accessibilityRole="button"
        accessibilityLabel="Redémarrer l’app sur la nouvelle version"
        hitSlop={8}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <Text style={styles.actionLabel}>{isRestarting ? "Redémarrage…" : "Redémarrer"}</Text>
      </Pressable>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize }: Theme) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.chipBg,
    },
    text: { flex: 1, color: colors.chipText, fontSize: fontSize.small, fontWeight: "600" },
    action: {
      minHeight: 36,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
    },
    pressed: { opacity: 0.6 },
    actionLabel: { color: colors.onPrimary, fontSize: fontSize.small, fontWeight: "700" },
  });
}
