import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { ListCard, ListRow } from "@/components/list";
import { MomentPicker } from "@/components/moment-picker";
import { PrimaryButton } from "@/components/primary-button";
import { SignatureCard } from "@/components/signature-card";
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
import { defaultMoment, momentLabel, type MealMoment } from "@/lib/tonight";
import { useSession } from "@/lib/session";
import {
  fetchLatestSession,
  startSession,
  subscribeToGroupSessions,
  type LatestSession,
} from "@/lib/votes";
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
      return `${impact.successorName} prendra le relais pour organiser.`;
    case "delete":
      return "Tu es la seule personne du groupe : il disparaîtra avec tout son historique.";
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
  // Midi ou soir du prochain vote, présélectionné selon l'heure d'ouverture de l'écran.
  const [moment, setMoment] = useState<MealMoment>(() => defaultMoment(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [leaveStep, setLeaveStep] = useState<LeaveStep>("idle");
  const [leaveImpact, setLeaveImpact] = useState<LeaveImpact | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran
  // (le temps réel peut en lancer plusieurs coup sur coup).
  const latestRequestRef = useRef(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const loadGroup = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    Promise.all([fetchGroup(id), fetchLatestSession(id)]).then(
      ([loadedGroup, loadedSession]) => {
        if (latestRequestRef.current !== requestId) return;
        setGroup(loadedGroup);
        setLatestSession(loadedSession);
        setHasFailed(false);
      },
      () => {
        if (latestRequestRef.current !== requestId) return;
        setHasFailed(true);
      },
    );
  }, [id]);

  // À chaque retour sur l'écran : recharger (un vote a pu être lancé ou clôturé
  // entre-temps), puis suivre en direct les votes de ce groupe tant que l'écran est
  // affiché. Sans ça, un membre arrivé avant le lancement voyait « Lancer un vote ».
  useFocusEffect(
    useCallback(() => {
      loadGroup();
      return subscribeToGroupSessions(id, loadGroup);
    }, [id, loadGroup]),
  );

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
      openSession(await startSession(id, moment));
    } catch {
      setError("Le vote n’a pas démarré : vérifie ta connexion et réessaie.");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleShare(detail: GroupDetail) {
    setError(null);

    try {
      await Share.share({
        message: `Rejoins « ${detail.name} » sur On mange quoi ? Ton code : ${detail.invite_code}`,
      });
    } catch {
      setError("Le partage ne s’ouvre pas. Note le code et envoie-le toi-même.");
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
      setLeaveError("On n’arrive pas à préparer ton départ : vérifie ta connexion et réessaie.");
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
      setLeaveError("Tu n’as pas quitté le groupe : vérifie ta connexion et réessaie.");
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
      setDeleteError("Le groupe n’a pas été supprimé : vérifie ta connexion et réessaie.");
    }
  }

  function handleCancelDelete() {
    setDeleteStep("idle");
    setDeleteError(null);
  }

  if (hasFailed) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir ce groupe"
        message="Vérifie ta connexion et réessaie."
        onRetry={retry}
      />
    );
  }
  if (!group) {
    return <LoadingScreen />;
  }

  // Une carte de confirmation apparaît sous les autres : on l'amène à l'écran.
  function scrollToConfirm() {
    scrollRef.current?.scrollToEnd({ animated: true });
  }

  // Affichage seulement : la RLS refuse la suppression à tout autre membre.
  const isOwner = group.owner_id === session?.user.id;

  return (
    <ScrollView
      ref={scrollRef}
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
              <Avatar
                key={member.id}
                name={member.name}
                avatar={member.avatar}
                photoPath={member.photoPath}
                size={30}
              />
            ))}
          </View>
          <Text style={styles.memberNames} numberOfLines={1}>
            {group.members.map((member) => member.name).join(", ")}
          </Text>
        </View>
      </View>

      {/* Vote en cours : carte neutre, comme sur l'accueil. Sinon, la carte signature. */}
      {latestSession?.isOpen ? (
        <Card>
          <Chip label="Vote en cours" hasDot />
          <Text style={styles.cardTitle}>
            On mange quoi {momentLabel(latestSession.moment ?? "soir")} ?
          </Text>
          <Text style={styles.muted}>Un vote est ouvert : coche tout ce qui te tente.</Text>
          <PrimaryButton label="Voter" onPress={() => openSession(latestSession.id)} />
        </Card>
      ) : (
        <SignatureCard>
          {latestSession ? (
            <>
              <Text style={styles.signatureMuted}>Dernier vote</Text>
              <Pressable
                onPress={() => openSession(latestSession.id)}
                accessibilityRole="button"
                accessibilityLabel={`Voir le résultat du dernier vote : ${latestSession.winnerName}`}
                style={({ pressed }) => [styles.lastResult, pressed && styles.pressed]}
              >
                <Text style={[styles.signatureTitle, styles.lastWinner]}>
                  {latestSession.winnerName}
                </Text>
                <Feather name="chevron-right" size={22} color={theme.colors.onSignature} />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.signatureTitle}>Pas encore de vote. Lance le premier !</Text>
              <Text style={styles.signatureMuted}>
                Lance le premier : chacun coche ce qui lui fait envie.
              </Text>
            </>
          )}
          <MomentPicker
            value={moment}
            onChange={setMoment}
            tone="signature"
            isDisabled={isStarting}
          />
          <PrimaryButton
            label="Lancer un vote"
            variant="signature"
            onPress={handleStartVote}
            isLoading={isStarting}
          />
        </SignatureCard>
      )}
      {/* Sous la carte : la couleur d'erreur ne se lit pas sur la tomate. */}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      {/* Le code ne sert qu'à l'arrivée d'un membre : une ligne, pas une carte de tous les jours. */}
      <ListCard>
        <ListRow
          icon="shopping-cart"
          label="Liste de courses"
          subtitle="Partagée avec le groupe, en direct"
          hasChevron
          onPress={() =>
            router.push({ pathname: "/courses/[groupId]", params: { groupId: group.id } })
          }
        />
        <ListRow
          icon="user-plus"
          label="Inviter quelqu’un"
          subtitle={`Code ${group.invite_code} · à envoyer ou à dicter`}
          onPress={() => handleShare(group)}
          accessibilityLabel={`Inviter quelqu’un avec le code ${group.invite_code}`}
        />
      </ListCard>

      {(leaveStep === "confirm" || leaveStep === "leaving") && leaveImpact ? (
        // En bas de l'écran et plus haute que les liens : on la fait défiler à l'écran.
        <Card onLayout={scrollToConfirm}>
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
        <Card onLayout={scrollToConfirm}>
          <Text style={styles.confirmTitle} accessibilityRole="header">
            Supprimer « {group.name} » ?
          </Text>
          <Text style={styles.muted}>
            Il disparaît pour tous ses membres, avec tout l’historique des votes. Personne ne sera
            prévenu. Pas de retour en arrière.
          </Text>
          <PrimaryButton
            label="Supprimer pour tout le monde"
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

      {/* Actions destructrices en liens discrets, en bas : jamais aussi visibles que l'action
          principale. La confirmation reste obligatoire (cartes ci-dessus). */}
      {leaveStep === "confirm" || leaveStep === "leaving" || deleteStep !== "idle" ? null : (
        <View style={styles.dangerLinks}>
          <TextButton
            label={leaveStep === "loading" ? "Chargement…" : "Quitter le groupe"}
            onPress={handleAskLeave}
            isDisabled={leaveStep === "loading"}
          />
          {isOwner ? (
            <TextButton
              label="Supprimer le groupe"
              variant="danger"
              onPress={handleAskDelete}
              isDisabled={leaveStep === "loading"}
            />
          ) : null}
        </View>
      )}

      {leaveError || deleteError ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {leaveError ?? deleteError}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
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
    cardTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    signatureTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    signatureMuted: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    // Poussés en bas de l'écran (container en flexGrow), côte à côte.
    dangerLinks: {
      marginTop: "auto",
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.xl,
    },
    error: { color: colors.danger, fontSize: fontSize.small },
    lastResult: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    lastWinner: { flex: 1 },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
