import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hapticToggle } from "@/lib/haptics";
import type { MealMoment } from "@/lib/tonight";
import { useTheme, type Theme } from "@/theme";

const OPTIONS: { moment: MealMoment; label: string }[] = [
  { moment: "midi", label: "Ce midi" },
  { moment: "soir", label: "Ce soir" },
];

type MomentPickerProps = {
  value: MealMoment;
  onChange: (moment: MealMoment) => void;
  // signature : sur la carte tomate de l'accueil. default : sur un fond clair.
  tone?: "signature" | "default";
  isDisabled?: boolean;
};

// Midi ou soir, au lancement d'un vote de foyer (migration vote_moment). Présélectionné selon
// l'heure : un choix obligatoire a une valeur par défaut, on ne touche que pour la changer.
export function MomentPicker({
  value,
  onChange,
  tone = "default",
  isDisabled = false,
}: MomentPickerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isSignature = tone === "signature";

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Pour quel repas ?">
      {OPTIONS.map((option) => {
        const isSelected = option.moment === value;
        return (
          <Pressable
            key={option.moment}
            onPress={() => {
              if (isSelected) return;
              hapticToggle(true);
              onChange(option.moment);
            }}
            disabled={isDisabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            style={({ pressed }) => [
              styles.option,
              isSignature ? styles.optionSignature : styles.optionDefault,
              isSelected && (isSignature ? styles.selectedSignature : styles.selectedDefault),
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                isSignature ? styles.labelSignature : styles.labelDefault,
                isSelected &&
                  (isSignature ? styles.labelSelectedSignature : styles.labelSelectedDefault),
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm },
    // 48 dp : la cible tactile minimale (accessibilité).
    option: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 1.5,
    },
    optionSignature: { borderColor: colors.onSignatureMuted },
    optionDefault: { borderColor: colors.border, backgroundColor: colors.surface },
    selectedSignature: {
      backgroundColor: colors.signatureButton,
      borderColor: colors.signatureButton,
    },
    selectedDefault: { backgroundColor: colors.primary, borderColor: colors.primary },
    pressed: { opacity: 0.8 },
    label: { fontSize: fontSize.body, fontWeight: "600" },
    labelSignature: { color: colors.onSignature },
    labelDefault: { color: colors.text },
    labelSelectedSignature: { color: colors.onSignatureButton },
    labelSelectedDefault: { color: colors.onPrimary },
  });
}
