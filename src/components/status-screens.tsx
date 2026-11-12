import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

// Attente hors du Stack : l'app ne sait pas encore vers quel écran aller.
export function LoadingScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.colors.brand} size="large" accessibilityLabel="Chargement" />
    </View>
  );
}

type ErrorScreenProps = {
  title: string;
  message: string;
  onRetry: () => void;
  // Sortie de secours quand aucun autre écran n'est accessible.
  canSignOut?: boolean;
};

// Avertissement qui remplace l'écran : on ne fait jamais passer un échec pour une liste vide.
export function ErrorScreen({ title, message, onRetry, canSignOut = false }: ErrorScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.warning} accessibilityRole="alert">
        <View style={styles.badge}>
          <Text style={styles.badgeText}>!</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Réessayer" onPress={onRetry} />
        {canSignOut ? (
          <TextButton label="Se déconnecter" onPress={() => supabase.auth.signOut()} />
        ) : null}
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.xl,
      backgroundColor: colors.background,
    },
    warning: {
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.xl,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
    badge: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.danger,
    },
    badgeText: { color: colors.background, fontFamily: fonts.display, fontSize: 28 },
    title: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 22,
      textAlign: "center",
    },
    message: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: 26,
      textAlign: "center",
    },
    actions: { gap: spacing.xs },
  });
}
