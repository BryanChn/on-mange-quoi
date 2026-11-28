import { useMemo, type PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, type Theme } from "@/theme";

type FormSectionProps = PropsWithChildren<{
  title: string;
  // Nombre d'éléments déjà saisis (« Ingrédients 3 »), affiché en gris à côté du titre.
  count?: number;
  // « Facultatif » à droite du titre : on voit tout de suite ce qu'on peut sauter.
  isOptional?: boolean;
  // Une phrase d'aide sous le titre, pour toute la section.
  hint?: string;
}>;

// Une section de formulaire (maquette du 28/11, https://claude.ai/artifact/Fib37nyL3VH8SykZG4Bvf2).
// Trois niveaux qui ne se confondent plus : le titre de section en Bricolage (heading), le
// libellé d'un champ en texte demi-gras (small), l'aide en caption pâle. À ne pas confondre avec
// Section, l'en-tête discret d'une liste groupée.
export function FormSection({ title, count, isOptional, hint, children }: FormSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasCount = count !== undefined && count > 0;
  // Le lecteur d'écran entend tout en une fois : « Ingrédients, 3 » ou « Pour le carnet, facultatif ».
  const a11yLabel = [title, hasCount ? String(count) : null, isOptional ? "facultatif" : null]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {/* Le compteur à côté du titre, pas dedans : un Text imbriqué hériterait de Bricolage. */}
          <View style={styles.titleGroup}>
            <Text style={styles.title} accessibilityRole="header" accessibilityLabel={a11yLabel}>
              {title}
            </Text>
            {hasCount ? (
              <Text style={styles.count} importantForAccessibility="no" accessibilityElementsHidden>
                {count}
              </Text>
            ) : null}
          </View>
          {isOptional ? (
            <Text
              style={styles.optional}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              Facultatif
            </Text>
          ) : null}
        </View>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Le libellé d'un champ dans une section (« Type de plat », « Budget »), du même style que
// celui de TextField.
export function FieldLabel({ children }: PropsWithChildren) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <Text style={styles.label}>{children}</Text>;
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    section: { gap: spacing.md },
    header: { gap: spacing.xs },
    titleRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    titleGroup: {
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.sm,
    },
    title: {
      flexShrink: 1,
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.heading,
      lineHeight: 28,
    },
    // Le compteur garde la police du texte : c'est une donnée, pas une partie du titre.
    count: { fontSize: fontSize.body, color: colors.textMuted },
    optional: { color: colors.textMuted, fontSize: fontSize.caption },
    hint: { color: colors.textMuted, fontSize: fontSize.caption, lineHeight: 18 },
    label: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
  });
}
