import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { AVATAR_IDS, AVATAR_LABELS, toAvatarId, type AvatarId } from "@/lib/avatar";
import { useTheme, type Theme } from "@/theme";

type AvatarPickerProps = {
  name: string;
  // Avatar actuel tel qu'en base (null = l'initiale).
  selected: string | null;
  onSelect: (avatar: AvatarId | null) => void;
  isDisabled?: boolean;
};

// L'initiale puis les six avatars prédéfinis. Un seul choix possible : des boutons radio
// pour les lecteurs d'écran. La photo perso viendra avec un prochain APK.
export function AvatarPicker({ name, selected, onSelect, isDisabled = false }: AvatarPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const current = toAvatarId(selected);
  const choices: { id: AvatarId | null; label: string }[] = [
    { id: null, label: "Initiale" },
    ...AVATAR_IDS.map((id) => ({ id, label: AVATAR_LABELS[id] })),
  ];

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {choices.map((choice) => {
        const isSelected = choice.id === current;
        return (
          <Pressable
            key={choice.id ?? "initiale"}
            onPress={() => onSelect(choice.id)}
            disabled={isDisabled || isSelected}
            accessibilityRole="radio"
            accessibilityLabel={choice.label}
            accessibilityState={{ checked: isSelected, disabled: isDisabled }}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
          >
            <View style={[styles.ring, isSelected && styles.ringSelected]}>
              <Avatar name={name} avatar={choice.id} size={52} />
            </View>
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles({ colors, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    // Cases de 25 % alignées à gauche : la dernière ligne (incomplète) reste sous les
    // colonnes du dessus. space-between écartait ses avatars jusqu'aux bords.
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      rowGap: spacing.lg,
    },
    // Quatre par ligne ; 64 de large : zone tactile confortable (≥ 48).
    choice: { width: "25%", alignItems: "center", gap: spacing.xs },
    pressed: { opacity: 0.6 },
    ring: { padding: 3, borderRadius: 999, borderWidth: 2.5, borderColor: "transparent" },
    ringSelected: { borderColor: colors.primary },
    label: { color: colors.textMuted, fontSize: fontSize.caption },
    labelSelected: { color: colors.text, fontWeight: "700" },
  });
}
