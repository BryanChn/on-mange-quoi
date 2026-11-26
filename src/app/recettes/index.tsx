import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InitialTile, ListCard, ListRow } from "@/components/list";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { getInitial } from "@/lib/avatar";
import { fetchCarnets, type CarnetSummary } from "@/lib/recipes";
import { loadErrorMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

// Le choix du carnet, quand on a plusieurs foyers : l'accueil garde une seule ligne
// « Recettes ». Avec un seul foyer, l'accueil ouvre son carnet directement.
export default function CarnetsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [carnets, setCarnets] = useState<CarnetSummary[] | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setCarnets(await fetchCarnets());
      setHasFailed(false);
    } catch (error) {
      setLoadError(error);
      setHasFailed(true);
    }
  }, []);

  // Au retour d'un carnet, les compteurs sont à jour.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (hasFailed && !carnets) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir tes carnets"
        message={loadErrorMessage(loadError)}
        onRetry={load}
      />
    );
  }
  if (!carnets) return <LoadingScreen />;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
    >
      <Text style={styles.title} accessibilityRole="header">
        Recettes
      </Text>
      <ListCard>
        {carnets.map((carnet) => (
          <ListRow
            key={carnet.groupId}
            label={carnet.name}
            subtitle={
              carnet.recipeCount === 0
                ? "Carnet vide"
                : `${carnet.recipeCount} recette${carnet.recipeCount > 1 ? "s" : ""}`
            }
            leading={<InitialTile initial={getInitial(carnet.name)} />}
            hasChevron
            onPress={() =>
              router.push({ pathname: "/recettes/[groupId]", params: { groupId: carnet.groupId } })
            }
          />
        ))}
      </ListCard>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
  });
}
