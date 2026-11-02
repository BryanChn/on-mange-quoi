import { router } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { createGroup } from "@/lib/groups";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne groups.name.
const GROUP_NAME_MAX_LENGTH = 50;

export default function CreateGroup() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const cleanName = name.trim();
    if (cleanName === "") {
      setError("Donne un nom à ton groupe.");
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const groupId = await createGroup(cleanName);
      // replace : le bouton retour ramène à la liste, pas à ce formulaire déjà envoyé.
      router.replace({ pathname: "/group/[id]", params: { id: groupId } });
    } catch {
      setError("Impossible de créer le groupe. Vérifie ton réseau et réessaie.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <Text style={styles.subtitle}>
        Le foyer, les colocs, les amis : tu pourras inviter les autres juste après.
      </Text>
      <TextField
        label="Nom du groupe"
        value={name}
        onChangeText={setName}
        error={error}
        placeholder="Famille"
        autoCapitalize="sentences"
        maxLength={GROUP_NAME_MAX_LENGTH}
        editable={!isSaving}
        onSubmitEditing={handleCreate}
      />
      <PrimaryButton label="Créer le groupe" onPress={handleCreate} isLoading={isSaving} />
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: "center" },
    subtitle: { fontSize: fontSize.body, lineHeight: 26, color: colors.textMuted },
  });
}
