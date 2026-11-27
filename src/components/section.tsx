import { useMemo, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, type Theme } from "@/theme";

type SectionProps = PropsWithChildren<{
  title: string;
  // Lien à droite du titre (« Voir tout · 20 », « Ajouter aux courses »).
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  // Petite note sous le contenu (« Écrites pour l'app… »).
  footnote?: string;
}>;

// Une section d'écran (refonte v4) : un titre discret comme un en-tête de liste groupée, un
// lien d'action facultatif, puis son contenu. La hiérarchie vient de la typo, pas d'une carte.
export function Section({ title, action, footnote, children }: SectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.section}>
      <SectionHeader title={title} action={action} />
      {children}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

// Le titre seul, pour une liste dont les lignes sont posées à plat à côté de lui (liste de
// courses : un article glisse d'une section à l'autre dans la même colonne).
export function SectionHeader({ title, action }: Pick<SectionProps, "title" | "action">) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          hitSlop={12}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles({ colors, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    section: { gap: spacing.sm },
    header: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    title: { flexShrink: 1, color: colors.textMuted, fontSize: fontSize.small, fontWeight: "700" },
    action: { color: colors.primary, fontSize: fontSize.small, fontWeight: "700" },
    pressed: { opacity: 0.6 },
    footnote: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      lineHeight: 18,
      paddingHorizontal: spacing.xs,
    },
  });
}
