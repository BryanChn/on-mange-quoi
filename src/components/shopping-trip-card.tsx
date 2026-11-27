import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TextButton } from "@/components/text-button";
import { clockLabel, tripToShow } from "@/lib/shopping-rules";
import type { ShoppingTrip } from "@/lib/shopping";
import { useTheme, type Theme } from "@/theme";

type ShoppingTripCardProps = {
  trips: ShoppingTrip[];
  userId: string | undefined;
  nameOf: (profileId: string) => string;
  isBusy: boolean;
  onEnd: () => void;
};

// « Je pars faire les courses » (CLAUDE.md, liste de courses) : le bandeau quand on y est
// (« J'ai fini ») ou quand quelqu'un y est. Partir se fait depuis l'en-tête de la liste.
export function ShoppingTripCard({ trips, userId, nameOf, isBusy, onEnd }: ShoppingTripCardProps) {
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

  return null;
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
