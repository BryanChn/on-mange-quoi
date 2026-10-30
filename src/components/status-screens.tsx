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
      <ActivityIndicator
        color={theme.colors.primary}
        size="large"
        accessibilityLabel="Chargement"
      />
    </View>
  );
}

type ProfileErrorScreenProps = {
  onRetry: () => void;
};

// Sans ce profil, impossible de savoir s'il faut demander le nom : on ne devine pas.
export function ProfileErrorScreen({ onRetry }: ProfileErrorScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.message} accessibilityRole="alert">
        Impossible de charger ton profil. Vérifie ton réseau et réessaie.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Réessayer" onPress={onRetry} />
        <TextButton label="Se déconnecter" onPress={() => supabase.auth.signOut()} />
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.xl,
      backgroundColor: colors.background,
    },
    message: { color: colors.text, fontSize: fontSize.body, lineHeight: 26, textAlign: "center" },
    actions: { gap: spacing.xs },
  });
}
