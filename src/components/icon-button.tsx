import { Feather } from "@expo/vector-icons";
import { useMemo, type ComponentProps } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { useTheme, type Theme } from "@/theme";

type IconButtonProps = {
  icon: ComponentProps<typeof Feather>["name"];
  // Obligatoire : un bouton sans texte doit dire ce qu'il fait au lecteur d'écran.
  accessibilityLabel: string;
  onPress: () => void;
  // lg : à côté d'un bouton principal (48) ; md : posé sur une photo (40).
  size?: "lg" | "md";
  isDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Bouton rond à icône (refonte v4) : le panier à côté de « Cuisiner », la photo d'une recette.
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = "lg",
  isDisabled = false,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const side = size === "lg" ? theme.control.lg : theme.control.md;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      hitSlop={size === "md" ? 4 : 0}
      style={({ pressed }) => [
        styles.button,
        { width: side, height: side },
        (pressed || isDisabled) && styles.dimmed,
        style,
      ]}
    >
      <Feather name={icon} size={size === "lg" ? 22 : 18} color={theme.colors.chipText} />
    </Pressable>
  );
}

function createStyles({ colors, radius }: Theme) {
  return StyleSheet.create({
    button: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.chipBg,
    },
    dimmed: { opacity: 0.6 },
  });
}
