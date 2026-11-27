import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import type { HomeSoiree } from "@/lib/home";
import { useTheme, type Theme } from "@/theme";

// Au-delà, les visages déborderaient de la petite carte : le compte dit combien on est.
const MAX_FACES = 4;

// Où en est un repas, selon sa façon de faire.
export function mealStepLabel(soiree: Pick<HomeSoiree, "step" | "mode">): string {
  if (soiree.step === "commande") return "Commande ouverte";
  if (soiree.step === "passee") return "Commande passée";
  if (soiree.mode === "maison") return soiree.step === "decide" ? "Menu décidé" : "Le menu se vote";
  return soiree.step === "decide" ? "C’est décidé" : "Où on mange ?";
}

type MealCardProps = {
  soiree: HomeSoiree;
  // « Demain », « Vendredi » ; null pour un repas sans date.
  when: string | null;
  // Le plus proche : cerclé de tomate.
  isNext: boolean;
};

// Un repas à plusieurs dans « Bientôt » : quand, quoi, où il en est, qui vient.
export function MealCard({ soiree, when, isNext }: MealCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const count = soiree.members.length;
  const step = mealStepLabel(soiree);
  const people = `${count} ${count > 1 ? "inscrits" : "inscrit"}`;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/soiree/[id]", params: { id: soiree.id } })}
      accessibilityRole="button"
      accessibilityLabel={[when, soiree.name, step, people].filter(Boolean).join(", ")}
      style={({ pressed }) => [styles.card, isNext && styles.next, pressed && styles.pressed]}
    >
      {when ? <Text style={styles.when}>{when}</Text> : null}
      <Text style={styles.name} numberOfLines={2}>
        {soiree.name}
      </Text>
      <Text style={styles.step} numberOfLines={1}>
        {step}
      </Text>
      <View style={styles.people}>
        <View style={styles.faces}>
          {soiree.members.slice(0, MAX_FACES).map((member, index) => (
            <View key={member.id} style={[styles.faceRing, index > 0 && styles.faceOverlap]}>
              <Avatar
                name={member.name}
                avatar={member.avatar}
                photoPath={member.photoPath}
                size={22}
              />
            </View>
          ))}
        </View>
        <Text style={styles.step}>{people}</Text>
      </View>
    </Pressable>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    card: {
      flexGrow: 1,
      gap: spacing.xs + 2,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
    next: { borderWidth: 1.5, borderColor: colors.primary },
    pressed: { opacity: 0.6 },
    when: {
      color: colors.chipText,
      fontSize: fontSize.caption - 1,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    name: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.cardTitle,
      lineHeight: 22,
    },
    step: { color: colors.textMuted, fontSize: fontSize.caption },
    people: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: "auto" },
    faces: { flexDirection: "row" },
    faceRing: { borderWidth: 2, borderColor: colors.surface, borderRadius: radius.pill },
    faceOverlap: { marginLeft: -6 },
  });
}
