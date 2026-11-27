import { Feather } from "@expo/vector-icons";
import { useMemo, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type Theme } from "@/theme";

type HelpLine = { icon: ComponentProps<typeof Feather>["name"]; text: string };

type HelpCardProps = { lines: HelpLine[]; onClose: () => void };

// L'aide d'un écran (validée le 27/11 sur la liste de courses) : trois lignes courtes au plus,
// un geste ou une règle par ligne, une croix pour fermer. Seulement là où ça ne se devine pas.
export function HelpCard({ lines, onClose }: HelpCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.lines}>
        {lines.map((line) => (
          <View key={line.text} style={styles.line}>
            <Feather name={line.icon} size={15} color={theme.colors.textMuted} />
            <Text style={styles.text}>{line.text}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Fermer l’aide"
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Feather name="x" size={18} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

// Le « ? » qui fait revenir l'aide, à côté du titre de l'écran.
export function HelpButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Revoir l’aide"
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <Feather name="help-circle" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function createStyles({ colors, spacing, radius, fontSize }: Theme) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    lines: { flex: 1, gap: spacing.sm },
    line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    text: { flex: 1, color: colors.textMuted, fontSize: fontSize.caption, lineHeight: 18 },
    close: { padding: spacing.xs },
    pressed: { opacity: 0.6 },
  });
}
