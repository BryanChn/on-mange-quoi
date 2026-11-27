import { Feather } from "@expo/vector-icons";
import { useMemo, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { AisleIcon } from "@/components/aisle-icon";
import { dishLayout } from "@/lib/motion";
import type { ShoppingAisle } from "@/lib/shopping-rules";
import { useTheme, type Theme } from "@/theme";

type AisleSectionProps = PropsWithChildren<{
  aisle: ShoppingAisle | "important";
  title: string;
  // Articles pris, sur le total du rayon : « 2/5 ».
  takenCount: number;
  total: number;
  isOpen: boolean;
  onToggle: () => void;
}>;

// Un rayon de la liste de courses en accordéon (maquette du 27/11 :
// https://claude.ai/artifact/7mpAE8Dc6HmkNigkPi4GV3) : icône, nom bien visible, « 2/5 » et une
// fine barre d'avancement. Terminé, il passe au vert avec une coche (l'écran le replie).
export function AisleSection({
  aisle,
  title,
  takenCount,
  total,
  isOpen,
  onToggle,
  children,
}: AisleSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDone = total > 0 && takenCount === total;

  return (
    <Animated.View layout={dishLayout} style={styles.section}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${title}, ${takenCount} pris sur ${total}${isDone ? ", terminé" : ""}`}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={[styles.icon, isDone && styles.iconDone]}>
          {isDone ? (
            <Feather name="check" size={18} color={theme.colors.success} />
          ) : (
            <AisleIcon aisle={aisle} size={18} />
          )}
        </View>
        <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.count, isDone && styles.countDone]}>
          {takenCount}/{total}
        </Text>
        <Feather
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.colors.textMuted}
        />
      </Pressable>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            isDone && styles.fillDone,
            { width: `${total > 0 ? Math.round((takenCount / total) * 100) : 0}%` },
          ]}
        />
      </View>
      {isOpen ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    section: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
      overflow: "hidden",
    },
    head: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
    },
    pressed: { opacity: 0.7 },
    icon: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md - 2,
      // Fond neutre : l'emoji apporte sa couleur.
      backgroundColor: colors.surface2,
    },
    iconDone: { backgroundColor: colors.dietBg },
    title: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.body,
    },
    titleDone: { color: colors.textMuted },
    count: {
      color: colors.textMuted,
      fontSize: fontSize.caption,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    countDone: { color: colors.success },
    track: { height: 3, backgroundColor: colors.surface2 },
    fill: { height: "100%", backgroundColor: colors.primary },
    fillDone: { backgroundColor: colors.success },
  });
}
