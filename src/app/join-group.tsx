import { router } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { isSoireeGroup, joinGroup } from "@/lib/groups";
import { JOIN_FAILURE_MESSAGES, toJoinFailure } from "@/lib/soiree-rules";
import { failureMessage } from "@/lib/network-errors";
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
      setError("Tape le code qu’on t’a envoyé (groupe ou repas).");
      return;
    }
    setError(null);
    setIsJoining(true);

    try {
      const groupId = await joinGroup(cleanCode);
      if (groupId === null) {
        setError("Ce code ne mène nulle part. Vérifie-le avec la personne qui te l’a envoyé.");
        return;
      }
      // replace : le bouton retour ramène à la liste, pas à ce formulaire déjà envoyé.
      if (await isSoireeGroup(groupId)) {
        router.replace({ pathname: "/soiree/[id]", params: { id: groupId } });
      } else {
        router.replace({ pathname: "/group/[id]", params: { id: groupId } });
      }
    } catch (joinError) {
      // Soirée : commande déjà passée, ou complète (mêmes règles que le lien).
      const failure = toJoinFailure(joinError);
      setError(
        failure
          ? JOIN_FAILURE_MESSAGES[failure].title
          : failureMessage("Tu n’as pas pu rejoindre", joinError),
      );
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
        Le code d’un groupe ou d’un repas, reçu d’un de ses membres. Majuscules et espaces n’ont pas
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
