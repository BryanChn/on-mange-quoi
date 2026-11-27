import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type TextButtonProps = {
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  // danger : action destructive (supprimer un groupe). La couleur prévient avant le texte.
  variant?: "default" | "danger";
};

// Action secondaire, sans fond : ne concurrence pas le bouton principal de l'écran.
export function TextButton({
  label,
  onPress,
  isDisabled = false,
  variant = "default",
}: TextButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text
        style={[
          styles.label,
          variant === "danger" && styles.labelDanger,
          isDisabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles({ colors, fontSize }: Theme) {
  return StyleSheet.create({
    // 44 de haut : la zone tactile minimale d'Apple, même si le texte paraît plus petit.
    button: { minHeight: 44, alignItems: "center", justifyContent: "center" },
    pressed: { opacity: 0.6 },
    // La couleur d'action (refonte du 2026-11-27) : un lien se reconnaît sans fond.
    label: { color: colors.primary, fontSize: fontSize.button, fontWeight: "600" },
    labelDanger: { color: colors.danger },
    labelDisabled: { color: colors.textMuted, fontWeight: "400" },
  });
}
