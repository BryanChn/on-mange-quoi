import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hapticTick } from "@/lib/haptics";
import { servingsLabel } from "@/lib/recipe-rules";
import { useTheme, type Theme } from "@/theme";

// Mêmes bornes que recipes.servings.
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 20;

type ServingsStepperProps = {
  value: number;
  onChange: (value: number) => void;
};

// « Parts  −  4  + » : sur une recette (adapter les quantités) et en l'écrivant.
// Un lecteur d'écran l'annonce comme un réglage ajustable (balayer vers le haut ou le bas).
export function ServingsStepper({ value, onChange }: ServingsStepperProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  function change(next: number) {
    if (next < MIN_SERVINGS || next > MAX_SERVINGS) return;
    hapticTick();
    onChange(next);
  }

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Parts"
      accessibilityValue={{ text: servingsLabel(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) =>
        change(event.nativeEvent.actionName === "increment" ? value + 1 : value - 1)
      }
    >
      <Text style={styles.label}>Parts</Text>
      <View style={styles.controls}>
        <Pressable
          onPress={() => change(value - 1)}
          disabled={value <= MIN_SERVINGS}
          style={({ pressed }) => [
            styles.button,
            (pressed || value <= MIN_SERVINGS) && styles.dimmed,
          ]}
        >
          <Feather name="minus" size={20} color={theme.colors.chipText} />
        </Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable
          onPress={() => change(value + 1)}
          disabled={value >= MAX_SERVINGS}
          style={({ pressed }) => [
            styles.button,
            (pressed || value >= MAX_SERVINGS) && styles.dimmed,
          ]}
        >
          <Feather name="plus" size={20} color={theme.colors.chipText} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
    label: { color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    controls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    button: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.chipBg,
    },
    dimmed: { opacity: 0.5 },
    value: {
      minWidth: 28,
      textAlign: "center",
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 22,
    },
  });
}
