import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InitialTile, ListCard, ListRow } from "@/components/list";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { getInitial } from "@/lib/avatar";
import { fetchShoppingLists, type ShoppingListSummary } from "@/lib/shopping";
import { loadErrorMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

// Le choix de la liste, quand plusieurs foyers ont des courses à faire : l'accueil garde une
// seule ligne « Liste de courses ». Avec une seule liste à faire, l'accueil l'ouvre directement.
export default function ShoppingListsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<ShoppingListSummary[] | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setLists(await fetchShoppingLists());
      setHasFailed(false);
    } catch (error) {
      setLoadError(error);
      setHasFailed(true);
    }
  }, []);

  // Au retour d'une liste, les compteurs sont à jour.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (hasFailed && !lists) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir tes listes"
        message={loadErrorMessage(loadError)}
        onRetry={load}
      />
    );
  }
  if (!lists) return <LoadingScreen />;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        Listes de courses
      </Text>
      <ListCard>
        {lists.map((list) => (
          <ListRow
            key={list.groupId}
            label={list.name}
            subtitle={list.toBuy > 0 ? `${list.toBuy} à acheter` : "Rien à acheter"}
            leading={<InitialTile initial={getInitial(list.name)} />}
            hasChevron
            onPress={() =>
              router.push({ pathname: "/courses/[groupId]", params: { groupId: list.groupId } })
            }
          />
        ))}
      </ListCard>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
  });
}
