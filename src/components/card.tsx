import { useMemo, type PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme, type Theme } from "@/theme";

type CardProps = PropsWithChildren<{ style?: StyleProp<ViewStyle> }>;

// Bloc principal d'un écran (le vote du soir, le détail d'un résultat).
export function Card({ children, style }: CardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return <View style={[styles.card, style]}>{children}</View>;
}

function createStyles({ colors, spacing, radius, cardShadow }: Theme) {
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      gap: spacing.md,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
  });
}
