import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type TextButtonProps = {
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
};

// Action secondaire, sans fond : ne concurrence pas le bouton principal de l'écran.
export function TextButton({ label, onPress, isDisabled = false }: TextButtonProps) {
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
      <Text style={[styles.label, isDisabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors, fontSize }: Theme) {
  return StyleSheet.create({
    // 48 de haut : taille minimale confortable pour un doigt.
    button: { minHeight: 48, alignItems: "center", justifyContent: "center" },
    pressed: { opacity: 0.6 },
    label: { color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    labelDisabled: { color: colors.textMuted, fontWeight: "400" },
  });
}
