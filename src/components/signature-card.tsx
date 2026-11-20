import { useMemo, type PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme, type Theme } from "@/theme";

type SignatureCardProps = PropsWithChildren<{ style?: StyleProp<ViewStyle> }>;

// La carte de couleur de l'écran (« Ce soir », dernier vote, résultat) : une seule par écran,
// pour que l'œil aille droit à l'action. Le texte posé dessus prend colors.onSignature, ses
// boutons la variante « signature ». Une erreur s'affiche sous la carte, jamais dessus
// (colors.danger ne se lit pas sur la tomate).
export function SignatureCard({ children, style }: SignatureCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return <View style={[styles.card, style]}>{children}</View>;
}

function createStyles({ colors, spacing, radius }: Theme) {
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      gap: spacing.md,
      borderRadius: radius.xl,
      backgroundColor: colors.signature,
    },
  });
}
