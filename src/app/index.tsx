import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { fetchGroups, type Group } from "@/lib/groups";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

export default function Index() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { profile } = useProfile();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);

  const loadGroups = useCallback(() => {
    // Si on quitte l'écran pendant l'appel, sa réponse arrive trop tard : on l'ignore.
    let isStale = false;

    fetchGroups()
      .then(
        (loadedGroups) => {
          if (isStale) return;
          setGroups(loadedGroups);
          setHasFailed(false);
        },
        () => {
          if (!isStale) setHasFailed(true);
        },
      )
      .finally(() => {
        if (!isStale) setIsLoading(false);
      });

    return () => {
      isStale = true;
    };
  }, []);

  // À chaque retour sur l'écran, et pas une seule fois : un groupe créé ou rejoint
  // depuis un autre écran doit apparaître dans la liste.
  useFocusEffect(loadGroups);

  function retry() {
    setIsLoading(true);
    loadGroups();
  }

  if (isLoading) {
    return <LoadingScreen />;
  }
  // Échec distinct de la liste vide : sans réseau, on ne dit pas « pas de groupe ».
  if (hasFailed) {
    return (
      <ErrorScreen
        title="Impossible de charger tes groupes"
        message="Vérifie ton réseau et réessaie."
        onRetry={retry}
        canSignOut
      />
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={(group) => group.id}
      ListHeaderComponent={
        <Text style={styles.title} accessibilityRole="header">
          Salut {profile?.display_name} !
        </Text>
      }
      renderItem={({ item }) => (
        <View style={styles.group}>
          <Text style={styles.groupName}>{item.name}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Tu n’as pas encore de groupe.</Text>}
      ListFooterComponent={
        <TextButton label="Se déconnecter" onPress={() => supabase.auth.signOut()} />
      }
    />
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: { padding: spacing.xl, gap: spacing.md },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    group: {
      padding: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    groupName: { color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    empty: { color: colors.textMuted, fontSize: fontSize.body },
  });
}
