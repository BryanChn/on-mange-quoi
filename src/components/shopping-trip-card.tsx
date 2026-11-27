import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { clockLabel, tripToShow } from "@/lib/shopping-rules";
import type { ShoppingTrip } from "@/lib/shopping";
import { useTheme, type Theme } from "@/theme";

type ShoppingTripCardProps = {
  trips: ShoppingTrip[];
  userId: string | undefined;
  nameOf: (profileId: string) => string;
  // Seul dans le foyer : personne à prévenir, pas de bouton.
  canStart: boolean;
  isBusy: boolean;
  onStart: () => void;
  onEnd: () => void;
};

// « Je pars faire les courses » (CLAUDE.md, liste de courses) : partir, être aux courses
// (« J'ai fini »), ou voir que quelqu'un y est.
export function ShoppingTripCard({
  trips,
  userId,
  nameOf,
  canStart,
  isBusy,
  onStart,
  onEnd,
}: ShoppingTripCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const shown = tripToShow(trips, userId);

  if (shown?.isMine) {
    return (
      <View style={styles.banner}>
        <Text style={styles.title} accessibilityRole="header">
          Tu es aux courses
        </Text>
        <Text style={styles.text}>
          Ce que le foyer ajoute t’arrive en notification, jusqu’à{" "}
          {clockLabel(new Date(shown.trip.endsAt))}.
        </Text>
        <TextButton label="J’ai fini" onPress={onEnd} isDisabled={isBusy} />
      </View>
    );
  }

  if (shown) {
    const name = nameOf(shown.trip.shopperId);
    return (
      <View style={styles.banner}>
        <Text style={styles.title} accessibilityRole="header">
          {name} est aux courses
        </Text>
        <Text style={styles.text}>
          Ajoute ce qu’il te faut : ça lui arrive en notification jusqu’à{" "}
          {clockLabel(new Date(shown.trip.endsAt))}.
        </Text>
      </View>
    );
  }

  if (!canStart) return null;
  return (
    <PrimaryButton
      label="Je pars faire les courses"
      variant="secondary"
      size="md"
      onPress={onStart}
      isLoading={isBusy}
    />
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    // Un bandeau teinté, pas une carte : une info du moment, pas une action à lire.
    banner: {
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
    },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.cardTitle },
    text: { color: colors.text, fontSize: fontSize.small, lineHeight: 22 },
  });
}
