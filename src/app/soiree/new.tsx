import { router } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { useProfile } from "@/lib/profile";
import { defaultSoireeName, SOIREE_NAME_MAX_LENGTH } from "@/lib/soiree-rules";
import { createSoiree } from "@/lib/soirees";
import { useTheme, type Theme } from "@/theme";

export default function NewSoiree() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const { profile } = useProfile();
  // Pré-rempli (« Samedi chez Bryan ») : on crée en un toucher, modifiable avant.
  const [name, setName] = useState(() =>
    defaultSoireeName(new Date(), profile?.display_name ?? ""),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const cleanName = name.trim();
    if (cleanName === "") {
      setError("Donne un nom à ta soirée.");
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const soiree = await createSoiree(cleanName);
      // replace : le retour ramène à l'accueil, pas à ce formulaire déjà envoyé. On invite
      // ensuite, quand on veut, depuis la soirée (retour d'usage du 2026-11-23 : le partage
      // ouvert d'office n'était pas intuitif).
      router.replace({ pathname: "/soiree/[id]", params: { id: soiree.id } });
    } catch {
      setError("Impossible de créer la soirée. Vérifie ton réseau et réessaie.");
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <Text style={styles.title} accessibilityRole="header">
        Une soirée à organiser ?
      </Text>
      <Text style={styles.subtitle}>
        Crée la soirée, puis invite qui tu veux : avec un lien (même sans l’app) ou un code. On
        choisit où manger, puis chacun écrit sa commande.
      </Text>
      <TextField
        label="Nom de la soirée"
        value={name}
        onChangeText={setName}
        error={error}
        placeholder="Samedi chez moi"
        autoCapitalize="sentences"
        maxLength={SOIREE_NAME_MAX_LENGTH}
        editable={!isSaving}
        onSubmitEditing={handleCreate}
      />
      <Text style={styles.hint}>Tes invités verront ce nom.</Text>
      <PrimaryButton label="Créer la soirée" onPress={handleCreate} isLoading={isSaving} />
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: "center" },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    subtitle: { fontSize: fontSize.body, lineHeight: 26, color: colors.textMuted },
    hint: { fontSize: fontSize.small, color: colors.textMuted, marginTop: -spacing.sm },
  });
}
