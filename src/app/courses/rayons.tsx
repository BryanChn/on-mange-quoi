import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { hapticReject, hapticTick } from "@/lib/haptics";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import { fetchAisleSettings, saveAisleOrder } from "@/lib/shopping";
import { AISLE_LABELS, moveAisle, type ShoppingAisle } from "@/lib/shopping-rules";
import { useTheme, type Theme } from "@/theme";

// « Ordre des rayons » (form sheet) : dans l'ordre où l'on traverse le magasin, pour tout le
// foyer. « Autres » reste en dernier. Chaque flèche enregistre tout de suite.
export default function AisleOrderSheet() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<ShoppingAisle[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchAisleSettings(groupId).then((settings) => setOrder(settings.order), setLoadError);
  }, [groupId]);

  // L'ordre vient du serveur (un système extérieur) : chargé à l'ouverture de la feuille.
  useEffect(() => {
    load();
  }, [load]);

  if (loadError && !order) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir les rayons"
        message={loadErrorMessage(loadError)}
        onRetry={() => {
          setLoadError(null);
          load();
        }}
      />
    );
  }
  if (!order) return <LoadingScreen />;

  // Affiché tout de suite ; en cas d'échec, l'ordre d'avant revient.
  async function move(aisle: ShoppingAisle, delta: -1 | 1) {
    if (!order) return;
    const previous = order;
    const next = moveAisle(order, aisle, delta);
    hapticTick();
    setError(null);
    setOrder(next);
    try {
      await saveAisleOrder(groupId, next);
    } catch (cause) {
      hapticReject();
      setOrder(previous);
      setError(failureMessage("L’ordre n’a pas été enregistré", cause));
    }
  }

  const last = order.length - 1;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, 32) + theme.spacing.xl },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Ordre des rayons
        </Text>
        <Text style={styles.subtitle}>
          Dans l’ordre où tu traverses le magasin. Le même pour tout le foyer.
        </Text>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <View style={styles.list}>
        {order.map((aisle, index) => {
          const isOthers = aisle === "autres";
          return (
            <View key={aisle} style={[styles.row, index > 0 && styles.divider]}>
              <Text style={[styles.rowLabel, isOthers && styles.rowLabelMuted]}>
                {AISLE_LABELS[aisle]}
              </Text>
              {isOthers ? (
                <Text style={styles.fixed}>toujours en dernier</Text>
              ) : (
                <View style={styles.arrows}>
                  <IconButton
                    icon="arrow-up"
                    size="md"
                    accessibilityLabel={`Monter ${AISLE_LABELS[aisle]}`}
                    onPress={() => move(aisle, -1)}
                    isDisabled={index === 0}
                  />
                  <IconButton
                    icon="arrow-down"
                    size="md"
                    accessibilityLabel={`Descendre ${AISLE_LABELS[aisle]}`}
                    onPress={() => move(aisle, 1)}
                    isDisabled={index >= last - 1}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
    header: { gap: spacing.xs },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
    subtitle: { color: colors.textMuted, fontSize: fontSize.small, lineHeight: 20 },
    error: { color: colors.danger, fontSize: fontSize.small },
    list: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" },
    row: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowLabel: { flex: 1, color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    rowLabelMuted: { color: colors.textMuted },
    arrows: { flexDirection: "row", gap: spacing.xs },
    fixed: { color: colors.textMuted, fontSize: fontSize.caption, paddingRight: spacing.sm },
  });
}
