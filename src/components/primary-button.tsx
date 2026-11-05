import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  // danger : action irréversible (supprimer son compte). La couleur prévient avant le texte.
  variant?: "primary" | "danger";
};

// Bouton d'action principal de l'écran : un seul par écran.
export function PrimaryButton({
  label,
  onPress,
  isLoading = false,
  variant = "primary",
}: PrimaryButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: isLoading, disabled: isLoading }}
      style={({ pressed }) => [
        styles.button,
        variant === "danger" && styles.danger,
        pressed && (variant === "danger" ? styles.dangerPressed : styles.pressed),
        isLoading && styles.loading,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={theme.colors.onPrimary} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

function createStyles({ colors, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    button: {
      height: 56,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: { backgroundColor: colors.primaryStrong },
    danger: { backgroundColor: colors.danger },
    dangerPressed: { opacity: 0.85, backgroundColor: colors.danger },
    loading: { opacity: 0.7 },
    label: { color: colors.onPrimary, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
