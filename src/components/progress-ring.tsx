import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useTheme, type Theme } from "@/theme";

type ProgressRingProps = {
  // Entre 0 et 1.
  progress: number;
  // Au centre : « 3/8 ».
  label: string;
  accessibilityLabel: string;
  size?: number;
};

const STROKE = 5;

// Anneau de progression sans react-native-svg (absent de l'APK : l'ajouter demanderait un
// nouveau build). Deux moitiés masquées : dans chacune, un demi-anneau coloré tourne pour
// dévoiler l'arc, la droite de 0 à 50 %, la gauche de 50 à 100 %. L'arc suit la progression
// en douceur (500 ms, ease-out).
export function ProgressRing({
  progress,
  label,
  accessibilityLabel,
  size = 46,
}: ProgressRingProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme, size), [theme, size]);
  const clamped = Math.min(1, Math.max(0, progress));
  // Démarre à la bonne valeur ; ensuite, l'arc rejoint la nouvelle progression en douceur.
  const animated = useSharedValue(clamped);
  useEffect(() => {
    animated.set(withTiming(clamped, { duration: 500 }));
  }, [animated, clamped]);

  // Un demi-anneau coloré (bords haut et gauche, tourné de -45°) couvre la moitié gauche ; on
  // le fait tourner pour qu'il entre dans la moitié visible.
  // Une moitié sans rien à montrer est masquée : sinon le bord de son demi-anneau dépasse
  // d'un pixel à la jonction (anticrénelage).
  const rightHalf = useAnimatedStyle(() => ({
    opacity: animated.value > 0 ? 1 : 0,
    transform: [{ rotate: `${-45 + Math.min(animated.value, 0.5) * 360}deg` }],
  }));
  const leftHalf = useAnimatedStyle(() => ({
    opacity: animated.value > 0.5 ? 1 : 0,
    transform: [{ rotate: `${135 + Math.max(animated.value - 0.5, 0) * 360}deg` }],
  }));

  return (
    <View
      style={styles.ring}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <View style={styles.track} />
      <View style={[styles.clip, styles.clipRight]}>
        <Animated.View style={[styles.half, styles.halfInRight, rightHalf]} />
      </View>
      <View style={[styles.clip, styles.clipLeft]}>
        <Animated.View style={[styles.half, leftHalf]} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles({ colors, fontSize }: Theme, size: number) {
  const circle = {
    position: "absolute",
    top: 0,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: STROKE,
  } as const;
  return StyleSheet.create({
    ring: { width: size, height: size, alignItems: "center", justifyContent: "center" },
    track: { ...circle, left: 0, borderColor: colors.surface2 },
    clip: { position: "absolute", top: 0, width: size / 2, height: size, overflow: "hidden" },
    clipRight: { left: size / 2 },
    clipLeft: { left: 0 },
    half: {
      ...circle,
      left: 0,
      borderTopColor: colors.primary,
      borderLeftColor: colors.primary,
      borderRightColor: "transparent",
      borderBottomColor: "transparent",
    },
    // Dans la moitié droite, le cercle est décalé d'une demi-largeur vers la gauche.
    halfInRight: { left: -size / 2 },
    label: {
      color: colors.text,
      fontSize: fontSize.caption - 2,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
  });
}
