import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { ListCard, ListRow } from "@/components/list";
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

// Au-delà, les avatars pousseraient les prénoms hors de l'écran.
const MAX_AVATARS = 5;

export default function GroupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
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
    <ScrollView
      // Sans cette marge, « Supprimer le groupe » passe sous les boutons du téléphone.
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {group.name}
        </Text>
        <View style={styles.members}>
          <View style={styles.avatars}>
            {group.members.slice(0, MAX_AVATARS).map((member) => (
              <Avatar key={member.id} name={member.name} size={30} />
            ))}
          </View>
          <Text style={styles.memberNames} numberOfLines={1}>
            {group.members.map((member) => member.name).join(", ")}
          </Text>
          <Pressable
            onPress={() => handleShare(group)}
            accessibilityRole="button"
            accessibilityLabel="Inviter avec le code du groupe"
            hitSlop={6}
            style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}
          >
            <Text style={styles.inviteButtonLabel}>Inviter</Text>
          </Pressable>
        </View>
      </View>

      <Card>
        {latestSession?.isOpen ? (
          <>
            <Chip label="Vote en cours" hasDot />
            <Text style={styles.cardTitle}>On mange quoi ce soir ?</Text>
            <Text style={styles.muted}>Un vote est ouvert : coche tout ce qui te tente.</Text>
            <PrimaryButton label="Voter" onPress={() => openSession(latestSession.id)} />
          </>
        ) : (
          <>
            {latestSession ? (
              <>
                <Chip label="Dernier vote" />
                <Pressable
                  onPress={() => openSession(latestSession.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir le résultat du dernier vote : ${latestSession.winnerName}`}
                  style={({ pressed }) => [styles.lastResult, pressed && styles.pressed]}
                >
                  <Text style={[styles.cardTitle, styles.lastWinner]}>
                    {latestSession.winnerName}
                  </Text>
                  <Feather name="chevron-right" size={22} color={theme.colors.textMuted} />
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Aucun vote pour l’instant</Text>
                <Text style={styles.muted}>
                  Lance le premier : chacun coche ce qui lui fait envie.
                </Text>
              </>
            )}
            <PrimaryButton
              label="Lancer un vote"
              onPress={handleStartVote}
              isLoading={isStarting}
            />
          </>
        )}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Card>

      <Card style={styles.invite}>
        <Text style={styles.inviteLabel}>Code d’invitation</Text>
        <Text style={styles.inviteCode} selectable>
          {group.invite_code}
        </Text>
        <Text style={styles.inviteHint}>
          Envoie-le avec « Inviter », ou dicte-le : il se saisit dans « Rejoindre avec un code ».
        </Text>
      </Card>

      {leaveStep === "confirm" || leaveStep === "leaving" || deleteStep !== "idle" ? null : (
        <ListCard>
          <ListRow
            icon="log-out"
            label={leaveStep === "loading" ? "Chargement…" : "Quitter le groupe"}
            onPress={handleAskLeave}
            isDisabled={leaveStep === "loading"}
          />
          {isOwner ? (
            <ListRow
              icon="trash-2"
              label="Supprimer le groupe"
              variant="danger"
              onPress={handleAskDelete}
              isDisabled={leaveStep === "loading"}
            />
          ) : null}
        </ListCard>
      )}

      {(leaveStep === "confirm" || leaveStep === "leaving") && leaveImpact ? (
        <Card>
          <Text style={styles.confirmTitle} accessibilityRole="header">
            Quitter « {group.name} » ?
          </Text>
          <Text style={styles.muted}>{leaveMessage(leaveImpact)}</Text>
          <PrimaryButton
            label={leaveImpact.kind === "delete" ? "Quitter et supprimer" : "Quitter"}
            variant="danger"
            onPress={handleLeave}
            isLoading={leaveStep === "leaving"}
          />
          <TextButton label="Annuler" onPress={handleCancel} isDisabled={leaveStep === "leaving"} />
        </Card>
      ) : null}

      {deleteStep !== "idle" ? (
        <Card>
          <Text style={styles.confirmTitle} accessibilityRole="header">
            Supprimer « {group.name} » ?
          </Text>
          <Text style={styles.muted}>
            Le groupe sera supprimé pour tous ses membres, avec tout son historique de votes. Ils ne
            seront pas prévenus. C’est définitif.
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
        </Card>
      ) : null}

      {leaveError || deleteError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {leaveError ?? deleteError}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    pressed: { opacity: 0.6 },
    header: { gap: spacing.md },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    members: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    avatars: { flexDirection: "row", gap: spacing.xs },
    memberNames: { flex: 1, color: colors.textMuted, fontSize: fontSize.small },
    inviteButton: {
      height: 36,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
    },
    inviteButtonLabel: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
    cardTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    invite: { alignItems: "center", gap: spacing.sm },
    inviteLabel: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "600" },
    inviteCode: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: 30,
      letterSpacing: 2,
    },
    inviteHint: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
    error: { color: colors.danger, fontSize: fontSize.small },
    lastResult: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    lastWinner: { flex: 1 },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
