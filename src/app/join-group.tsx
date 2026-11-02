import { router } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { joinGroup } from "@/lib/groups";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne groups.invite_code.
const INVITE_CODE_MAX_LENGTH = 12;

export default function JoinGroup() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const [code, setCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    const cleanCode = code.trim();
    if (cleanCode === "") {
      setError("Entre le code reçu d’un membre du groupe.");
      return;
    }
    setError(null);
    setIsJoining(true);

    try {
      const groupId = await joinGroup(cleanCode);
      if (groupId === null) {
        setError("Ce code ne correspond à aucun groupe.");
        return;
      }
      // replace : le bouton retour ramène à la liste, pas à ce formulaire déjà envoyé.
      router.replace({ pathname: "/group/[id]", params: { id: groupId } });
    } catch {
      setError("Impossible de rejoindre le groupe. Vérifie ton réseau et réessaie.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <Text style={styles.subtitle}>
        Demande le code d’invitation à un membre du groupe. Majuscules et espaces n’ont pas
        d’importance.
      </Text>
      <TextField
        label="Code d’invitation"
        value={code}
        onChangeText={setCode}
        error={error}
        placeholder="K7MX4QP9"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={INVITE_CODE_MAX_LENGTH}
        editable={!isJoining}
        onSubmitEditing={handleJoin}
      />
      <PrimaryButton label="Rejoindre" onPress={handleJoin} isLoading={isJoining} />
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors, spacing, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: "center" },
    subtitle: { fontSize: fontSize.body, lineHeight: 26, color: colors.textMuted },
  });
}
