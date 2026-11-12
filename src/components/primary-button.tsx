import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  // secondary : l'action reste possible mais n'est plus l'étape attendue (« Voir le vote »
  // une fois qu'on a voté). danger : action irréversible, la couleur prévient avant le texte.
  variant?: "primary" | "secondary" | "danger";
};

// Bouton d'action de l'écran : un seul « primary » visible à la fois.
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
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        pressed && (variant === "primary" ? styles.pressed : styles.dimmed),
        isLoading && styles.loading,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator
          color={variant === "secondary" ? theme.colors.chipText : theme.colors.onPrimary}
        />
      ) : (
        <Text style={[styles.label, variant === "secondary" && styles.labelSecondary]}>
          {label}
        </Text>
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
    secondary: { backgroundColor: colors.chipBg },
    danger: { backgroundColor: colors.danger },
    dimmed: { opacity: 0.85 },
    loading: { opacity: 0.7 },
    label: { color: colors.onPrimary, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    labelSecondary: { color: colors.chipText },
  });
}
