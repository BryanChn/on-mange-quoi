import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import {
  deleteGroup,
  fetchGroup,
  fetchLeaveImpact,
  leaveGroup,
  type GroupDetail,
  type LeaveImpact,
} from "@/lib/groups";
import { useSession } from "@/lib/session";
import { fetchLatestSession, startSession, type LatestSession } from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

// idle → loading (calcul des conséquences) → confirm → leaving. Un départ réussi
// renvoie à l'accueil : le groupe n'y apparaît plus.
type LeaveStep = "idle" | "loading" | "confirm" | "leaving";
// Suppression pour tous (owner) : rien à calculer avant, pas d'étape loading.
type DeleteStep = "idle" | "confirm" | "deleting";

function leaveMessage(impact: LeaveImpact): string {
  switch (impact.kind) {
    case "member":
      return "Tu ne verras plus ce groupe. Tu pourras revenir avec le code d’invitation.";
    case "transfer":
      return `${impact.successorName} deviendra responsable du groupe.`;
    case "delete":
      return "Tu es seul dans ce groupe : il sera supprimé avec tout son historique de votes.";
  }
}

export default function GroupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [latestSession, setLatestSession] = useState<LatestSession | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveStep, setLeaveStep] = useState<LeaveStep>("idle");
  const [leaveImpact, setLeaveImpact] = useState<LeaveImpact | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadGroup = useCallback(() => {
    let isStale = false;

    Promise.all([fetchGroup(id), fetchLatestSession(id)]).then(
      ([loadedGroup, loadedSession]) => {
        if (isStale) return;
        setGroup(loadedGroup);
        setLatestSession(loadedSession);
        setHasFailed(false);
      },
      () => {
        if (!isStale) setHasFailed(true);
      },
    );

    return () => {
      isStale = true;
    };
  }, [id]);

  // À chaque retour : un membre a pu lancer ou clôturer un vote entre-temps.
  useFocusEffect(loadGroup);

  function retry() {
    setHasFailed(false);
    loadGroup();
  }

  function openSession(sessionId: string) {
    router.push({ pathname: "/session/[id]", params: { id: sessionId } });
  }

  async function handleStartVote() {
    setError(null);
    setIsStarting(true);

    try {
      openSession(await startSession(id));
    } catch {
      setError("Impossible de lancer le vote. Vérifie ton réseau et réessaie.");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleShare(detail: GroupDetail) {
    setError(null);

    try {
      await Share.share({
        message: `Rejoins « ${detail.name} » sur On mange quoi ? avec le code ${detail.invite_code}`,
      });
    } catch {
      setError("Impossible d’ouvrir le partage. Note le code et transmets-le à la main.");
    }
  }

  async function handleAskLeave() {
    setLeaveError(null);
    setLeaveStep("loading");

    try {
      setLeaveImpact(await fetchLeaveImpact(id));
      setLeaveStep("confirm");
    } catch {
      setLeaveStep("idle");
      setLeaveError("Impossible de préparer ton départ du groupe. Vérifie ton réseau et réessaie.");
    }
  }

  async function handleLeave() {
    setLeaveError(null);
    setLeaveStep("leaving");

    try {
      await leaveGroup(id);
      router.dismissTo("/");
    } catch {
      // Rien n'a changé : leave_group est une seule transaction.
      setLeaveStep("confirm");
      setLeaveError(
        "Le départ a échoué, tu es toujours membre du groupe. Vérifie ton réseau et réessaie.",
      );
    }
  }

  function handleCancel() {
    setLeaveStep("idle");
    setLeaveImpact(null);
    setLeaveError(null);
  }

  function handleAskDelete() {
    setDeleteError(null);
    setDeleteStep("confirm");
  }

  async function handleDelete() {
    setDeleteError(null);
    setDeleteStep("deleting");

    try {
      await deleteGroup(id);
      router.dismissTo("/");
    } catch {
      setDeleteStep("confirm");
      setDeleteError(
        "La suppression a échoué, le groupe est intact. Vérifie ton réseau et réessaie.",
      );
    }
  }

  function handleCancelDelete() {
    setDeleteStep("idle");
    setDeleteError(null);
  }

  if (hasFailed) {
    return (
      <ErrorScreen
        title="Impossible de charger ce groupe"
        message="Vérifie ton réseau et réessaie."
        onRetry={retry}
      />
    );
  }
  if (!group) {
    return <LoadingScreen />;
  }

  // Affichage seulement : la RLS refuse la suppression à tout autre membre.
  const isOwner = group.owner_id === session?.user.id;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {group.name}
      </Text>

      {latestSession && !latestSession.isOpen ? (
        <View style={styles.lastResult}>
          <Text style={styles.inviteLabel}>Dernier vote</Text>
          <Text style={styles.lastWinner}>{latestSession.winnerName}</Text>
          <TextButton label="Voir le résultat" onPress={() => openSession(latestSession.id)} />
        </View>
      ) : null}

      {latestSession?.isOpen ? (
        <PrimaryButton label="Voter" onPress={() => openSession(latestSession.id)} />
      ) : (
        <PrimaryButton label="Lancer un vote" onPress={handleStartVote} isLoading={isStarting} />
      )}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={styles.invite}>
        <Text style={styles.inviteLabel}>Code d’invitation</Text>
        <Text style={styles.inviteCode} selectable>
          {group.invite_code}
        </Text>
        <Text style={styles.inviteHint}>
          Envoie-le aux membres de ton groupe : ils le saisiront dans « Rejoindre avec un code ».
        </Text>
        <TextButton label="Partager le code" onPress={() => handleShare(group)} />
      </View>

      <View style={styles.leave}>
        {deleteStep === "idle" && (leaveStep === "idle" || leaveStep === "loading") ? (
          <TextButton
            label={leaveStep === "loading" ? "Chargement…" : "Quitter le groupe"}
            onPress={handleAskLeave}
            isDisabled={leaveStep === "loading"}
          />
        ) : null}

        {(leaveStep === "confirm" || leaveStep === "leaving") && leaveImpact ? (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Quitter « {group.name} » ?
            </Text>
            <Text style={styles.leaveText}>{leaveMessage(leaveImpact)}</Text>
            <PrimaryButton
              label={leaveImpact.kind === "delete" ? "Quitter et supprimer" : "Quitter"}
              variant="danger"
              onPress={handleLeave}
              isLoading={leaveStep === "leaving"}
            />
            <TextButton
              label="Annuler"
              onPress={handleCancel}
              isDisabled={leaveStep === "leaving"}
            />
          </>
        ) : null}

        {leaveError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {leaveError}
          </Text>
        ) : null}

        {isOwner && leaveStep === "idle" && deleteStep === "idle" ? (
          <TextButton label="Supprimer le groupe" onPress={handleAskDelete} variant="danger" />
        ) : null}

        {deleteStep !== "idle" ? (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Supprimer « {group.name} » ?
            </Text>
            <Text style={styles.leaveText}>
              Le groupe sera supprimé pour tous ses membres, avec tout son historique de votes. Ils
              ne seront pas prévenus. C’est définitif.
            </Text>
            <PrimaryButton
              label="Supprimer pour tous"
              variant="danger"
              onPress={handleDelete}
              isLoading={deleteStep === "deleting"}
            />
            <TextButton
              label="Annuler"
              onPress={handleCancelDelete}
              isDisabled={deleteStep === "deleting"}
            />
          </>
        ) : null}

        {deleteError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {deleteError}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    invite: {
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    lastResult: {
      alignItems: "center",
      gap: spacing.xs,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    lastWinner: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22 },
    inviteLabel: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "600" },
    inviteCode: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 30,
      letterSpacing: 2,
    },
    inviteHint: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
    error: { color: colors.danger, fontSize: fontSize.small },
    leave: { alignItems: "center", gap: spacing.md, marginTop: "auto" },
    sectionTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.body },
    leaveText: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
  });
}
