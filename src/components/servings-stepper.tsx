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
      <View style={styles.controls}>
        <Pressable
          onPress={() => change(value - 1)}
          disabled={value <= MIN_SERVINGS}
          hitSlop={4}
          style={({ pressed }) => [
            styles.button,
            (pressed || value <= MIN_SERVINGS) && styles.dimmed,
          ]}
        >
          <Feather name="minus" size={20} color={theme.colors.chipText} />
        </Pressable>
        <Text style={styles.value}>{servingsLabel(value)}</Text>
        <Pressable
          onPress={() => change(value + 1)}
          disabled={value >= MAX_SERVINGS}
          hitSlop={4}
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

// Refonte v4 : une pastille compacte « − 4 parts + », à la largeur de son contenu.
function createStyles({ colors, spacing, radius, fontSize, control }: Theme) {
  return StyleSheet.create({
    card: {
      alignSelf: "flex-start",
      height: control.md,
      justifyContent: "center",
      paddingHorizontal: 2,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
    },
    controls: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    button: {
      width: control.sm,
      height: control.sm,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    dimmed: { opacity: 0.4 },
    value: {
      minWidth: 64,
      textAlign: "center",
      color: colors.text,
      fontSize: fontSize.body - 1,
      fontWeight: "700",
    },
  });
}
