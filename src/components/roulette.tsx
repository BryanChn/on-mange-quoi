import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";

import { buildSpin } from "@/lib/roulette";
import { useTheme, type Theme } from "@/theme";

// Temps laissé sur le gagnant avant d'afficher le résultat.
const PAUSE_ON_WINNER_MS = 1200;

type RouletteProps = {
  names: string[];
  winnerIndex: number;
  onDone: () => void;
};

// Fait défiler les ex æquo et s'arrête sur le gagnant déjà tiré par le serveur.
export function Roulette({ names, winnerIndex, onDone }: RouletteProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isStopped, setIsStopped] = useState(false);

  // Dernière version de onDone, sans relancer l'animation si le parent en recrée une.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const steps = buildSpin(names.length, winnerIndex);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    function play(step: number) {
      if (step === steps.length) {
        setIsStopped(true);
        timer = setTimeout(() => onDoneRef.current(), PAUSE_ON_WINNER_MS);
        return;
      }
      setActiveIndex(steps[step].index);
      timer = setTimeout(() => play(step + 1), steps[step].delayMs);
    }

    // « Réduire les animations » activé : on passe directement au résultat.
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((isReduceMotion) => {
        if (isCancelled) return;
        if (isReduceMotion || steps.length === 0) onDoneRef.current();
        else play(0);
      });

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [names.length, winnerIndex]);

  return (
    <View style={styles.container}>
      <Text style={styles.label} accessibilityRole="header">
        {isStopped ? "Le sort a parlé !" : "Égalité : tirage au sort…"}
      </Text>
      {/* Un lecteur d'écran n'annonce pas chaque nom qui défile, seulement le résultat. */}
      <View
        style={[styles.card, isStopped && styles.cardStopped]}
        accessible
        accessibilityLabel={isStopped ? names[winnerIndex] : "Tirage en cours"}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.name} numberOfLines={2}>
          {names[activeIndex]}
        </Text>
      </View>
      <View style={styles.candidates} importantForAccessibility="no-hide-descendants">
        {names.map((name, index) => (
          <Text
            key={name}
            style={[styles.candidate, index === activeIndex && styles.candidateActive]}
          >
            {name}
          </Text>
        ))}
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      gap: spacing.xl,
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    label: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      fontWeight: "600",
      textAlign: "center",
    },
    card: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cardStopped: { borderColor: colors.brand },
    name: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.title,
      textAlign: "center",
    },
    candidates: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: spacing.sm,
    },
    candidate: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      overflow: "hidden",
      color: colors.textMuted,
      fontSize: fontSize.small,
      backgroundColor: colors.surface,
    },
    candidateActive: { color: colors.onPrimary, backgroundColor: colors.primary },
  });
}
