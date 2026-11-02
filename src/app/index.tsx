import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

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

  useEffect(() => {
    fetchGroups().then(setGroups);
  }, []);

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
