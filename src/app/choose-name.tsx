import { useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne profiles.display_name.
const DISPLAY_NAME_MAX_LENGTH = 30;

function getNameError(cleanName: string): string | null {
  if (cleanName === "") return "Entre le nom que verra ton groupe.";
  return null;
}

export default function ChooseName() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { createProfile } = useProfile();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const cleanName = name.trim();
    const nameError = getNameError(cleanName);
    if (nameError) {
      setError(nameError);
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      // Une fois le profil créé, la garde du layout mène seule à l'accueil.
      await createProfile(cleanName);
    } catch {
      setError("Impossible d’enregistrer ton nom. Vérifie ton réseau et réessaie.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Comment on t’appelle ?
          </Text>
          <Text style={styles.subtitle}>
            Ton prénom ou ton surnom : c’est ce que verra ton groupe.
          </Text>
        </View>

        <TextField
          label="Ton nom"
          value={name}
          onChangeText={setName}
          error={error}
          placeholder="Camille"
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          editable={!isSaving}
          onSubmitEditing={handleSave}
        />
        <PrimaryButton label="C’est parti" onPress={handleSave} isLoading={isSaving} />
        <TextButton label="Se déconnecter" onPress={() => supabase.auth.signOut()} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: "center" },
    intro: { gap: spacing.sm },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    subtitle: { fontSize: fontSize.body, lineHeight: 26, color: colors.textMuted },
  });
}
