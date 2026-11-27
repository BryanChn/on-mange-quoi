import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hapticAdded, hapticReject } from "@/lib/haptics";
import { failureMessage } from "@/lib/network-errors";
import { setShoppingItemAisle } from "@/lib/shopping";
import { AISLE_LABELS, SHOPPING_AISLES, type ShoppingAisle } from "@/lib/shopping-rules";
import { useTheme, type Theme } from "@/theme";

// « Choisir le rayon » d'un article (form sheet ouverte depuis la liste de courses). Le foyer
// s'en souvient pour ce nom : la prochaine fois, l'article arrive directement dans ce rayon.
export default function AisleSheet() {
  const { itemId, label, aisle } = useLocalSearchParams<{
    itemId: string;
    label: string;
    aisle: ShoppingAisle;
  }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState<ShoppingAisle | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: ShoppingAisle) {
    if (saving) return;
    if (next === aisle) {
      router.back();
      return;
    }
    setError(null);
    setSaving(next);
    try {
      await setShoppingItemAisle({ id: itemId, label }, next);
      hapticAdded();
      // La liste se recharge en reprenant la main (useFocusEffect) : l'article change de section.
      router.back();
    } catch (cause) {
      hapticReject();
      setError(failureMessage("Le rayon n’a pas changé", cause));
      setSaving(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xl }]}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {label}
        </Text>
        <Text style={styles.subtitle}>
          Dans quel rayon{"\u202F"}? Le foyer s’en souviendra pour «{"\u00A0"}
          {label}
          {"\u00A0"}».
        </Text>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <View style={styles.list} accessibilityRole="radiogroup">
        {SHOPPING_AISLES.map((option, index) => {
          const isCurrent = option === aisle;
          return (
            <Pressable
              key={option}
              onPress={() => choose(option)}
              disabled={saving !== null}
              accessibilityRole="radio"
              accessibilityState={{ checked: isCurrent, busy: saving === option }}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.divider,
                (pressed || saving === option) && styles.pressed,
              ]}
            >
              <Text style={[styles.rowLabel, isCurrent && styles.rowLabelCurrent]}>
                {AISLE_LABELS[option]}
              </Text>
              {isCurrent ? <Feather name="check" size={20} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
    header: { gap: spacing.xs },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
    subtitle: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    error: { color: colors.danger, fontSize: fontSize.small },
    list: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" },
    row: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    pressed: { backgroundColor: colors.surface2 },
    rowLabel: { color: colors.text, fontSize: fontSize.body },
    rowLabelCurrent: { color: colors.primary, fontWeight: "700" },
  });
}
