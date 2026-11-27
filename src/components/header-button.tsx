import { Feather } from "@expo/vector-icons";
import { useMemo, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type HeaderButtonProps = {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Feather>["name"];
};

// Petite action dans l'en-tête natif (« + Écrire ») : pastille teintée, à la place d'un gros
// bouton plein largeur en haut de l'écran (refonte v4).
export function HeaderButton({ label, onPress, icon }: HeaderButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {icon ? <Feather name={icon} size={16} color={theme.colors.chipText} /> : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors, spacing, radius, fontSize, control }: Theme) {
  return StyleSheet.create({
    button: {
      height: control.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      paddingHorizontal: spacing.md + 2,
      borderRadius: radius.pill,
      backgroundColor: colors.chipBg,
    },
    pressed: { opacity: 0.6 },
    label: { color: colors.chipText, fontSize: fontSize.small + 1, fontWeight: "600" },
  });
}
