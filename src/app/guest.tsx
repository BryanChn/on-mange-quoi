import { Redirect } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import { LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { signOut } from "@/lib/notifications";
import { fetchFirstSoireeId } from "@/lib/soirees";
import { useTheme, type Theme } from "@/theme";

// Point d'arrivée d'un invité sans lien (page rechargée sur « / », onglet rouvert) : il n'a
// accès qu'à sa soirée, on l'y renvoie. Plus de soirée (effacée 24 h après la commande, ou
// quittée) : on le dit, et il peut repartir de zéro.
export default function GuestHome() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // undefined : en chargement ; null : plus de soirée.
  const [soireeId, setSoireeId] = useState<string | null | undefined>(undefined);
  const [hasFailed, setHasFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isStale = false;
    fetchFirstSoireeId().then(
      (id) => {
        if (!isStale) setSoireeId(id);
      },
      () => {
        if (!isStale) setHasFailed(true);
      },
    );
    return () => {
      isStale = true;
    };
  }, [attempt]);

  if (soireeId) {
    return <Redirect href={{ pathname: "/soiree/[id]", params: { id: soireeId } }} />;
  }
  if (soireeId === undefined && !hasFailed) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.screen}>
      <Card>
        {hasFailed ? (
          <>
            <Text style={styles.title}>On ne retrouve pas ton repas</Text>
            <Text style={styles.muted}>Vérifie ta connexion et réessaie.</Text>
            <PrimaryButton
              label="Réessayer"
              onPress={() => {
                setHasFailed(false);
                setAttempt((count) => count + 1);
              }}
            />
          </>
        ) : (
          <>
            <Text style={styles.title}>Ce repas est terminé</Text>
            <Text style={styles.muted}>
              Merci pour le repas ! Pour le prochain, ouvre le lien qu’on t’enverra.
            </Text>
          </>
        )}
        <TextButton label="Fermer" onPress={signOut} />
      </Card>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
  });
}
