import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme, type Theme } from "@/theme";

type FilterChipProps = {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  // Icône devant le libellé ; reçoit la couleur du texte quand la chip est active.
  icon?: (color: string | undefined) => ReactNode;
};

// Filter chip (refonte v4) : contour fin au repos, pleine et foncée une fois choisie. Un
// lecteur d'écran l'annonce comme un bouton, sélectionné ou non.
export function FilterChip({ label, isSelected, onPress, icon }: FilterChipProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        isSelected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      {icon ? icon(isSelected ? theme.colors.background : undefined) : null}
      <Text style={[styles.label, isSelected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors, spacing, radius, fontSize, control }: Theme) {
  return StyleSheet.create({
    chip: {
      height: control.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: { borderColor: colors.text, backgroundColor: colors.text },
    pressed: { opacity: 0.6 },
    label: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
    labelSelected: { color: colors.background },
  });
}
