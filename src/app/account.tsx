import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { deleteAccount, fetchDeletionImpact, type DeletionImpact } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

// idle → loading (calcul des conséquences) → confirm → deleting. Une suppression réussie
// déconnecte : le layout renvoie alors à l'écran de connexion, cet écran disparaît.
type DeleteStep = "idle" | "loading" | "confirm" | "deleting";

export default function AccountScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { profile } = useProfile();
  const [step, setStep] = useState<DeleteStep>("idle");
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        {profile?.display_name}
      </Text>

      <TextButton
        label="Se déconnecter"
        onPress={() => supabase.auth.signOut()}
        isDisabled={step === "deleting"}
      />

      <View style={styles.dangerZone}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Supprimer mon compte
        </Text>

        {step === "idle" || step === "loading" ? (
          <>
            <Text style={styles.text}>
              Ton compte, ton nom et tes votes sont effacés définitivement.
            </Text>
            <TextButton
              label={step === "loading" ? "Chargement…" : "Supprimer mon compte"}
              onPress={handleAskDelete}
              isDisabled={step === "loading"}
            />
          </>
        ) : null}

        {(step === "confirm" || step === "deleting") && impact ? (
          <>
            <Text style={styles.text}>Avant de confirmer, voici ce qui va se passer :</Text>
            <View style={styles.list}>
              {impact.ownedGroups.map((group) => (
                <Text key={group.groupId} style={styles.item}>
                  •{" "}
                  {group.successorName
                    ? `« ${group.groupName} » : ${group.successorName} en devient responsable.`
                    : `« ${group.groupName} » est supprimé, avec ses votes (tu y es seul).`}
                </Text>
              ))}
              {impact.openSessionCount > 0 ? (
                <Text style={styles.item}>
                  •{" "}
                  {impact.openSessionCount === 1
                    ? "Le vote que tu as lancé reste ouvert : le responsable du groupe pourra le clôturer."
                    : `Les ${impact.openSessionCount} votes que tu as lancés restent ouverts : les responsables des groupes pourront les clôturer.`}
                </Text>
              ) : null}
              <Text style={styles.item}>
                • Tu quittes tous tes groupes, et tes votes sont effacés.
              </Text>
              <Text style={styles.item}>• Les plats que tu as proposés restent, sans ton nom.</Text>
            </View>
            <Text style={styles.warning}>C’est définitif : impossible de revenir en arrière.</Text>
            <PrimaryButton
              label="Supprimer définitivement"
              onPress={handleDelete}
              isLoading={step === "deleting"}
              variant="danger"
            />
            <TextButton label="Annuler" onPress={handleCancel} isDisabled={step === "deleting"} />
          </>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.xl },
    title: { fontFamily: fonts.display, fontSize: fontSize.screenTitle, color: colors.text },
    dangerZone: {
      gap: spacing.md,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    sectionTitle: {
      color: colors.danger,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.button,
    },
    text: { color: colors.text, fontSize: fontSize.body, lineHeight: 26 },
    list: { gap: spacing.sm },
    item: { color: colors.text, fontSize: fontSize.body, lineHeight: 24 },
    warning: { color: colors.danger, fontSize: fontSize.body, fontWeight: "600" },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
