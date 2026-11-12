import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { ListCard, ListRow } from "@/components/list";
import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { deleteAccount, fetchDeletionImpact, type DeletionImpact } from "@/lib/account";
import { DISPLAY_NAME_MAX_LENGTH, useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

// idle → loading (calcul des conséquences) → confirm → deleting. Une suppression réussie
// déconnecte : le layout renvoie alors à l'écran de connexion, cet écran disparaît.
type DeleteStep = "idle" | "loading" | "confirm" | "deleting";

export default function AccountScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profile, saveDisplayName } = useProfile();
  const displayName = profile?.display_name ?? "";

  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [step, setStep] = useState<DeleteStep>("idle");
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleStartRename() {
    setNameDraft(displayName);
    setNameError(null);
    setIsRenaming(true);
  }

  async function handleSaveName() {
    const cleanName = nameDraft.trim();
    if (cleanName === "") {
      setNameError("Entre le nom que verra ton groupe.");
      return;
    }
    // Rien à enregistrer : on referme sans appeler le serveur.
    if (cleanName === displayName) {
      setIsRenaming(false);
      return;
    }
    setNameError(null);
    setIsSavingName(true);

    try {
      await saveDisplayName(cleanName);
      setIsRenaming(false);
    } catch {
      setNameError("Impossible d’enregistrer ton nom. Vérifie ton réseau et réessaie.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleAskDelete() {
    setError(null);
    setStep("loading");

    try {
      setImpact(await fetchDeletionImpact());
      setStep("confirm");
    } catch {
      setStep("idle");
      setError("Impossible de préparer la suppression. Vérifie ton réseau et réessaie.");
    }
  }

  async function handleDelete() {
    setError(null);
    setStep("deleting");

    try {
      await deleteAccount();
    } catch {
      // Rien n'a été supprimé : delete_account est une seule transaction.
      setStep("confirm");
      setError("La suppression a échoué, ton compte est intact. Vérifie ton réseau et réessaie.");
    }
  }

  function handleCancel() {
    setStep("idle");
    setImpact(null);
    setError(null);
  }

  const isConfirming = (step === "confirm" || step === "deleting") && impact !== null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.identity}>
          <Avatar name={displayName} size={72} />
          <Text style={styles.title} accessibilityRole="header">
            {displayName}
          </Text>
        </View>

        {isRenaming ? (
          <Card>
            <TextField
              label="Ton nom"
              value={nameDraft}
              onChangeText={setNameDraft}
              error={nameError}
              placeholder="Camille"
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              autoFocus
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              editable={!isSavingName}
              onSubmitEditing={handleSaveName}
            />
            <PrimaryButton label="Enregistrer" onPress={handleSaveName} isLoading={isSavingName} />
            <TextButton
              label="Annuler"
              onPress={() => setIsRenaming(false)}
              isDisabled={isSavingName}
            />
          </Card>
        ) : null}

        {!isRenaming && !isConfirming ? (
          <>
            <ListCard>
              <ListRow icon="edit-2" label="Changer mon nom" onPress={handleStartRename} />
              <ListRow
                icon="log-out"
                label="Se déconnecter"
                onPress={() => supabase.auth.signOut()}
              />
            </ListCard>
            <ListCard>
              <ListRow
                icon="trash-2"
                label={step === "loading" ? "Chargement…" : "Supprimer mon compte"}
                subtitle="Ton compte, ton nom et tes votes sont effacés"
                variant="danger"
                onPress={handleAskDelete}
                isDisabled={step === "loading"}
              />
            </ListCard>
          </>
        ) : null}

        {isConfirming ? (
          <Card>
            <Text style={styles.confirmTitle} accessibilityRole="header">
              Supprimer ton compte ?
            </Text>
            <Text style={styles.text}>Avant de confirmer, voici ce qui va se passer :</Text>
            <View style={styles.list}>
              {impact.ownedGroups.map((group) => (
                <Text key={group.groupId} style={styles.text}>
                  •{" "}
                  {group.successorName
                    ? `« ${group.groupName} » : ${group.successorName} en devient responsable.`
                    : `« ${group.groupName} » est supprimé, avec ses votes (tu y es seul).`}
                </Text>
              ))}
              {impact.openSessionCount > 0 ? (
                <Text style={styles.text}>
                  •{" "}
                  {impact.openSessionCount === 1
                    ? "Le vote que tu as lancé reste ouvert : le responsable du groupe pourra le clôturer."
                    : `Les ${impact.openSessionCount} votes que tu as lancés restent ouverts : les responsables des groupes pourront les clôturer.`}
                </Text>
              ) : null}
              <Text style={styles.text}>
                • Tu quittes tous tes groupes, et tes votes sont effacés.
              </Text>
              <Text style={styles.text}>• Les plats que tu as proposés restent, sans ton nom.</Text>
            </View>
            <Text style={styles.warning}>C’est définitif : impossible de revenir en arrière.</Text>
            <PrimaryButton
              label="Supprimer définitivement"
              onPress={handleDelete}
              isLoading={step === "deleting"}
              variant="danger"
            />
            <TextButton label="Annuler" onPress={handleCancel} isDisabled={step === "deleting"} />
          </Card>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: { padding: spacing.xl, gap: spacing.xl },
    identity: { alignItems: "center", gap: spacing.md },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
      textAlign: "center",
    },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    text: { color: colors.text, fontSize: fontSize.small, lineHeight: 22 },
    list: { gap: spacing.sm },
    warning: { color: colors.danger, fontSize: fontSize.small, fontWeight: "600" },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
