import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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
  // lg : l'action qui termine l'écran, toute la largeur. md : un bouton dans une carte (« Lancer
  // le vote » sur la carte du soir). sm : une petite action dans une liste. md et sm prennent la
  // largeur de leur texte (refonte du 2026-11-27, maquette v4).
  size?: "lg" | "md" | "sm";
  // Mise en page seulement (marges, alignement), fusionnée en dernier.
  style?: StyleProp<ViewStyle>;
};

// Bouton d'action de l'écran : un seul « primary » visible à la fois.
export function PrimaryButton({
  label,
  onPress,
  isLoading = false,
  isDisabled = false,
  variant = "primary",
  size = "lg",
  style,
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
        size === "md" && styles.md,
        size === "sm" && styles.sm,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        variant === "signature" && styles.signature,
        pressed && (variant === "primary" ? styles.pressed : styles.dimmed),
        (isLoading || isDisabled) && styles.loading,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={indicatorColor(variant, theme)} />
      ) : (
        <Text
          style={[
            styles.label,
            size !== "lg" && styles.labelCompact,
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

function createStyles({ colors, radius, control, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    button: {
      height: control.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    md: { height: control.md, alignSelf: "flex-start", paddingHorizontal: spacing.lg + 2 },
    sm: { height: control.sm, alignSelf: "flex-start", paddingHorizontal: spacing.md + 2 },
    pressed: { backgroundColor: colors.primaryStrong },
    secondary: { backgroundColor: colors.chipBg },
    danger: { backgroundColor: colors.danger },
    signature: { backgroundColor: colors.signatureButton },
    dimmed: { opacity: 0.85 },
    loading: { opacity: 0.7 },
    // Police système demi-grasse : la police des titres sur un bouton faisait « affiche ».
    label: { color: colors.onPrimary, fontSize: fontSize.button, fontWeight: "600" },
    labelCompact: { fontSize: 15 },
    labelSecondary: { color: colors.chipText },
    labelSignature: { color: colors.onSignatureButton },
  });
}
