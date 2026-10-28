import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

// Accueil provisoire : prouve que la connexion marche. Remplacé par la liste des groupes.
export default function Index() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { session } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Connecté : {session?.user.email}</Text>
      <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button">
        <Text style={styles.link}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

function createStyles({ colors, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
    text: { color: colors.text, fontSize: fontSize.body },
    // primary et non danger : se déconnecter n'est pas une erreur.
    link: { color: colors.primary, fontSize: fontSize.body, fontWeight: "600" },
  });
}
