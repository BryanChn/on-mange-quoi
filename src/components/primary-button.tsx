import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  // Indisponible pour l'instant, sans indicateur : une autre action est en cours.
  isDisabled?: boolean;
  // secondary : l'action reste possible mais n'est plus l'étape attendue (« Voir le vote »
  // une fois qu'on a voté). danger : action irréversible, la couleur prévient avant le texte.
  // signature : posé sur une SignatureCard, où « primary » se confondrait avec la carte.
  variant?: "primary" | "secondary" | "danger" | "signature";
};

// Bouton d'action de l'écran : un seul « primary » visible à la fois.
export function PrimaryButton({
  label,
  onPress,
  isLoading = false,
  isDisabled = false,
  variant = "primary",
}: PrimaryButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading || isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: isLoading, disabled: isLoading || isDisabled }}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        variant === "signature" && styles.signature,
        pressed && (variant === "primary" ? styles.pressed : styles.dimmed),
        (isLoading || isDisabled) && styles.loading,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={indicatorColor(variant, theme)} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "secondary" && styles.labelSecondary,
            variant === "signature" && styles.labelSignature,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function indicatorColor(variant: PrimaryButtonProps["variant"], { colors }: Theme): string {
  if (variant === "secondary") return colors.chipText;
  if (variant === "signature") return colors.onSignatureButton;
  return colors.onPrimary;
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
    signature: { backgroundColor: colors.signatureButton },
    dimmed: { opacity: 0.85 },
    loading: { opacity: 0.7 },
    label: { color: colors.onPrimary, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    labelSecondary: { color: colors.chipText },
    labelSignature: { color: colors.onSignatureButton },
  });
}
