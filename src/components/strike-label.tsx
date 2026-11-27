import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { STRIKE_EASING, STRIKE_MS } from "@/lib/motion";
import { useTheme, type Theme } from "@/theme";

type StrikeLabelProps = { label: string; isStruck: boolean };

// Le nom d'un article : coché, un trait le barre de gauche à droite, et le texte s'estompe.
// Sur une ligne (le trait suit la largeur du texte) ; un nom trop long est coupé par « … ».
export function StrikeLabel({ label, isStruck }: StrikeLabelProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Démarre à l'état affiché : un article déjà pris est barré d'emblée, sans animation.
  const progress = useSharedValue(isStruck ? 1 : 0);
  // Le trait ne se dessine que quand on coche ou décoche (animation sur le thread de l'UI).
  useEffect(() => {
    progress.set(withTiming(isStruck ? 1 : 0, { duration: STRIKE_MS, easing: STRIKE_EASING }));
  }, [isStruck, progress]);
  const line = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, isStruck && styles.labelStruck]} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View style={[styles.line, line]} pointerEvents="none" />
    </View>
  );
}

function createStyles({ colors, fontSize }: Theme) {
  return StyleSheet.create({
    wrap: { flexShrink: 1, justifyContent: "center" },
    label: { color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    labelStruck: { color: colors.textMuted },
    line: {
      position: "absolute",
      left: 0,
      right: 0,
      top: "52%",
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.textMuted,
      transformOrigin: "left",
    },
  });
}
