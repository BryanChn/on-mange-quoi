import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme, type Theme } from "@/theme";

type ChipProps = {
  label: string;
  // Point tomate devant le texte : quelque chose est en cours (un vote ouvert).
  hasDot?: boolean;
  // accent : le moment fort (plat en tête, gagnant). Sinon, simple information.
  variant?: "default" | "accent";
  style?: StyleProp<ViewStyle>;
};

// Étiquette courte, non cliquable : « Famille · vote en cours », « En tête ».
export function Chip({ label, hasDot = false, variant = "default", style }: ChipProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.chip, variant === "accent" && styles.chipAccent, style]}>
      {hasDot ? <View style={styles.dot} /> : null}
      <Text style={[styles.label, variant === "accent" && styles.labelAccent]}>{label}</Text>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize }: Theme) {
  return StyleSheet.create({
    chip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.chipBg,
    },
    chipAccent: { backgroundColor: colors.accent },
    dot: {
      width: spacing.sm,
      height: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.brand,
    },
    label: { color: colors.chipText, fontSize: fontSize.caption, fontWeight: "600" },
    labelAccent: { color: colors.onAccent, fontWeight: "700" },
  });
}
