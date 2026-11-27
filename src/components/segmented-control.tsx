import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hapticTick } from "@/lib/haptics";
import { useTheme, type Theme } from "@/theme";

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

// Segmented control : deux ou trois façons de voir la même chose (« Par rayon » / « Par
// ajout »). Le segment choisi se détache sur un fond teinté.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (isSelected) return;
              hapticTick();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={[styles.segment, isSelected && styles.segmentSelected]}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles({ colors, radius, fontSize, control, cardShadow }: Theme) {
  return StyleSheet.create({
    track: {
      flexDirection: "row",
      padding: 3,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
    },
    segment: {
      flex: 1,
      height: control.sm,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md - 3,
    },
    segmentSelected: { backgroundColor: colors.surface, boxShadow: cardShadow },
    label: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "600" },
    labelSelected: { color: colors.text },
  });
}
