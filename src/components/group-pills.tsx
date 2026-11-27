import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { GroupStatus } from "@/lib/tonight";
import { useTheme, type Theme } from "@/theme";

type GroupPill = { id: string; name: string; status: GroupStatus };

type GroupPillsProps = {
  groups: GroupPill[];
  selectedId: string;
  onSelect: (id: string) => void;
  edgeInset: number;
};

// Le nom d'un statut pour le lecteur d'écran (le point ne se lit pas).
const STATUS_LABEL: Record<GroupStatus, string> = {
  open: "vote en cours",
  decided: "c’est décidé",
  none: "",
};

// Les groupes de l'accueil, au-dessus des cartes « Ce soir » : tous visibles d'un coup d'œil,
// avec un point quand il s'y passe quelque chose (tomate : vote en cours ; basilic : décidé).
// Toucher une pastille fait glisser jusqu'à la carte du groupe, et la liste dessous le suit.
export function GroupPills({ groups, selectedId, onSelect, edgeInset }: GroupPillsProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -edgeInset }}
      contentContainerStyle={[styles.row, { paddingHorizontal: edgeInset }]}
      accessibilityRole="tablist"
    >
      {groups.map((group) => {
        const isSelected = group.id === selectedId;
        const status = STATUS_LABEL[group.status];
        return (
          <Pressable
            key={group.id}
            onPress={() => onSelect(group.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={status ? `${group.name}, ${status}` : group.name}
            hitSlop={4}
            style={({ pressed }) => [
              styles.pill,
              isSelected && styles.pillSelected,
              pressed && styles.pressed,
            ]}
          >
            {group.status === "none" ? null : (
              <View style={[styles.dot, group.status === "decided" && styles.dotDecided]} />
            )}
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
              {group.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fontSize, control }: Theme) {
  return StyleSheet.create({
    row: { gap: spacing.sm },
    pill: {
      height: control.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md + 2,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
    },
    // Le groupe affiché : la pastille foncée, comme un onglet choisi.
    pillSelected: { backgroundColor: colors.text },
    pressed: { opacity: 0.6 },
    dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
    dotDecided: { backgroundColor: colors.success },
    label: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
    labelSelected: { color: colors.background },
  });
}
