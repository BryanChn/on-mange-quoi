import { Feather } from "@expo/vector-icons";
import {
  Children,
  useMemo,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { useTheme, type Theme } from "@/theme";

type IconName = ComponentProps<typeof Feather>["name"];

// Liste groupée : des lignes dans un même bloc, séparées par un filet (groupes, réglages).
export function ListCard({ children }: PropsWithChildren) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // toArray écarte null et false : une ligne conditionnelle absente ne laisse pas de filet.
  const rows = Children.toArray(children);

  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <View style={styles.separator} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

type ListRowProps = {
  label: string;
  subtitle?: string;
  onPress: () => void;
  // Icône dans la tuile de gauche ; `leading` la remplace (initiale d'un groupe).
  icon?: IconName;
  leading?: ReactNode;
  // Chevron à droite : la ligne ouvre un autre écran.
  hasChevron?: boolean;
  // danger : action destructive, la couleur prévient avant le texte.
  variant?: "default" | "danger";
  isDisabled?: boolean;
  accessibilityLabel?: string;
};

export function ListRow({
  label,
  subtitle,
  onPress,
  icon,
  leading,
  hasChevron = false,
  variant = "default",
  isDisabled = false,
  accessibilityLabel,
}: ListRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDanger = variant === "danger";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${label}, ${subtitle}` : label)}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [styles.row, (pressed || isDisabled) && styles.dimmed]}
    >
      {leading ?? (
        <View style={[styles.tile, isDanger && styles.tileDanger]}>
          {icon ? (
            <Feather
              name={icon}
              size={20}
              color={isDanger ? theme.colors.danger : theme.colors.text}
            />
          ) : null}
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.label, isDanger && styles.labelDanger]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {hasChevron ? (
        <Feather name="chevron-right" size={20} color={theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

type ListSwitchRowProps = {
  label: string;
  subtitle?: string;
  icon: IconName;
  value: boolean;
  onChange: (value: boolean) => void;
  isDisabled?: boolean;
};

// Ligne de réglage avec un interrupteur. Toute la ligne bascule (cible plus grande que
// l'interrupteur seul) ; un lecteur d'écran l'annonce comme un interrupteur, activé ou non.
export function ListSwitchRow({
  label,
  subtitle,
  icon,
  value,
  onChange,
  isDisabled = false,
}: ListSwitchRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={isDisabled}
      accessibilityRole="switch"
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      accessibilityState={{ checked: value, disabled: isDisabled }}
      style={({ pressed }) => [styles.row, (pressed || isDisabled) && styles.dimmed]}
    >
      <View style={styles.tile}>
        <Feather name={icon} size={20} color={theme.colors.text} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {/* Décoratif pour l'accessibilité : la ligne porte déjà le rôle et l'état. */}
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={isDisabled}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

// Tuile de gauche d'une ligne, avec une initiale (un groupe) au lieu d'une icône.
export function InitialTile({ initial }: { initial: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.tile, styles.tileInitial]}>
      <Text style={styles.initial}>{initial}</Text>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    card: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: cardShadow },
    // Aligné sur le texte des lignes : marge (16) + tuile (40) + espace (12).
    separator: { height: 1, marginLeft: 68, backgroundColor: colors.border },
    row: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    dimmed: { opacity: 0.6 },
    tile: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: colors.surface2,
    },
    tileDanger: { backgroundColor: colors.chipBg },
    tileInitial: { backgroundColor: colors.chipBg },
    initial: { color: colors.chipText, fontFamily: fonts.display, fontSize: fontSize.button },
    text: { flex: 1, gap: 2 },
    label: { color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    labelDanger: { color: colors.danger },
    subtitle: { color: colors.textMuted, fontSize: fontSize.caption },
  });
}
