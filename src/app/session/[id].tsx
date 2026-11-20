import { Feather } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { PrimaryButton } from "@/components/primary-button";
import { Roulette } from "@/components/roulette";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import {
  dayLabel,
  everyoneHasVoted,
  formatTime,
  isSameDay,
  participationLine,
  summarizeParticipation,
} from "@/lib/tonight";
import { voterIdsWithMe, withMyVote } from "@/lib/optimistic-vote";
import {
  addProposal,
  closeSession,
  fetchSession,
  getLeadingProposals,
  isSessionClosedError,
  removeProposal,
  setVote,
  subscribeToSession,
  type DecisionMethod,
  type Proposal,
  type VoteSession,
} from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne proposals.name.
const PROPOSAL_NAME_MAX_LENGTH = 60;

// Liste stable tant que la session n'est pas chargée (base de useOptimistic).
const NO_PROPOSALS: Proposal[] = [];

type MyVote = { proposalId: string; wantVote: boolean };

// Étapes de la clôture : confirmer, c'est tout. Une égalité est tirée au sort par le serveur.
type CloseStep = "idle" | "confirm";

type Spin = { names: string[]; winnerIndex: number };

const DECISION_LABELS: Record<DecisionMethod, string> = {
  vote: "Gagné au vote",
  tirage: "Tiré au sort parmi les ex æquo",
  // N'existe plus depuis le 2026-11-19 : gardé pour afficher les sessions passées.
  organisateur: "Départagé à la main parmi les ex æquo",
};

function voteCountLabel(count: number): string {
  if (count === 0) return "aucun vote";
  return `${count} vote${count > 1 ? "s" : ""}`;
}

// dismissTo dépile jusqu'au groupe (ou le remplace s'il n'est pas dans la pile) :
// avec push, la flèche retour du groupe ramènerait au résultat.
function backToGroup(groupId: string) {
  router.dismissTo({ pathname: "/group/[id]", params: { id: groupId } });
}

// Roulette à jouer pour une session qui vient d'être tirée au sort : les ex æquo
// (votes figés à la clôture) et la position du gagnant enregistré par le serveur.
function spinFor(session: VoteSession): Spin | null {
  const leading = getLeadingProposals(session.proposals);
  const winnerIndex = leading.findIndex((proposal) => proposal.id === session.winnerProposalId);
  if (leading.length < 2 || winnerIndex === -1) return null;
  return { names: leading.map((proposal) => proposal.name), winnerIndex };
}

// Le nom du groupe en titre de l'en-tête : un membre de plusieurs groupes sait pour lequel
// il vote. N'affiche rien à l'écran ; « Le vote » (layout) reste pendant le chargement.
function GroupTitle({ name }: { name: string }) {
  return <Stack.Screen options={{ title: name }} />;
}

export default function SessionScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<VoteSession | null>(null);
  // « Aujourd'hui » au moment du chargement : l'horloge n'est jamais lue pendant le rendu.
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [dishName, setDishName] = useState("");
  // Proposer, retirer, clôturer : une action à la fois (un double appui n'ajoute pas deux plats).
  // Les votes n'en font pas partie : ils sont optimistes (voir plus bas).
  const [isBusy, setIsBusy] = useState(false);
  // Sous le champ : seulement ce qui concerne le nom tapé. Le reste (réseau, vote, retrait) à part.
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeStep, setCloseStep] = useState<CloseStep>("idle");
  // Le champ « Proposer un plat » n'apparaît qu'à la demande : la zone basse reste à l'action.
  const [isProposing, setIsProposing] = useState(false);
  const [spin, setSpin] = useState<Spin | null>(null);

  // Vote optimiste : la case se coche dès le toucher. Tant qu'un envoi est en cours, React
  // affiche la liste du serveur avec les votes provisoires par-dessus ; à la fin, il revient
  // à la liste du serveur seule, ce qui annule de lui-même un vote refusé.
  const [proposals, applyMyVote] = useOptimistic(
    session?.proposals ?? NO_PROPOSALS,
    (current: Proposal[], { proposalId, wantVote }: MyVote) =>
      withMyVote(current, proposalId, wantVote),
  );
  const [isVoting, startVoting] = useTransition();
  // Les votes partent un par un, dans l'ordre des touchers : cocher puis décocher vite ne doit
  // pas arriver au serveur dans le désordre (l'état final serait faux).
  const voteQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Numéro du dernier rechargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);
  // État ouvert / clôturé déjà affiché : la roulette ne se joue qu'au passage de l'un à
  // l'autre, vu en direct. Une session ouverte plus tard affiche directement le résultat.
  const wasOpenRef = useRef<boolean | null>(null);

  const loadSession = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;
    return fetchSession(id)
      .then(
        (loadedSession) => {
          if (latestRequestRef.current !== requestId) return;
          if (wasOpenRef.current && !loadedSession.isOpen && loadedSession.decidedBy === "tirage") {
            setSpin(spinFor(loadedSession));
          }
          wasOpenRef.current = loadedSession.isOpen;
          setSession(loadedSession);
          setLoadedAt(new Date());
          setHasFailed(false);
        },
        () => {
          if (latestRequestRef.current !== requestId) return;
          setHasFailed(true);
        },
      )
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Temps réel : la liste se recharge quand un membre vote, propose, retire un plat ou clôture.
  useEffect(() => {
    const unsubscribe = subscribeToSession(id, loadSession);
    // React appelle cette fonction en quittant l'écran (ou avant de relancer l'effet) : le canal se ferme.
    return unsubscribe;
  }, [id, loadSession]);

  const handleSpinDone = useCallback(() => setSpin(null), []);

  function retry() {
    setIsLoading(true);
    loadSession();
  }

  // Proposer, retirer, clôturer : l'écran ne change qu'après confirmation du serveur, on
  // recharge plutôt que de supposer (un nom peut être refusé, un plat déjà voté reste).
  async function runAction(action: () => Promise<void>, failureMessage: string) {
    setNameError(null);
    setActionError(null);
    setIsBusy(true);

    try {
      await action();
      await loadSession();
    } catch (error) {
      // Clôturé entre-temps : pas une panne réseau, le rechargement affiche le résultat.
      if (isSessionClosedError(error)) {
        await loadSession();
      } else {
        setActionError(failureMessage);
      }
    } finally {
      setIsBusy(false);
    }
  }

  function handlePropose() {
    const cleanName = dishName.trim();
    if (cleanName === "") {
      setNameError("Entre le nom d’un plat.");
      return;
    }

    runAction(async () => {
      const isAdded = await addProposal(id, cleanName);
      if (isAdded) {
        setDishName("");
      } else {
        setNameError("Ce plat est déjà proposé : coche-le dans la liste.");
      }
    }, "Impossible d’ajouter ce plat. Vérifie ton réseau et réessaie.");
  }

  // proposal est le plat affiché, vote provisoire compris : un second toucher décoche.
  function handleToggleVote(proposal: Proposal) {
    const wantVote = !proposal.hasMyVote;
    setActionError(null);

    startVoting(async () => {
      applyMyVote({ proposalId: proposal.id, wantVote });
      const request = voteQueueRef.current.then(() => setVote(proposal.id, wantVote));
      // La file avance même si cet envoi échoue : l'erreur est traitée juste en dessous.
      voteQueueRef.current = request.catch(() => undefined);

      try {
        await request;
        // La liste du serveur doit contenir le vote avant que le provisoire disparaisse.
        await loadSession();
      } catch (error) {
        // Clôturé entre-temps : le rechargement affiche le résultat.
        if (isSessionClosedError(error)) {
          await loadSession();
        } else {
          setActionError("Impossible d’enregistrer ton vote. Vérifie ton réseau et réessaie.");
        }
      }
    });
  }

  function handleRemove(proposal: Proposal) {
    runAction(async () => {
      const isRemoved = await removeProposal(proposal.id);
      if (!isRemoved)
        setActionError("Quelqu’un a déjà voté pour ce plat : il reste dans la liste.");
    }, "Impossible de retirer ce plat. Vérifie ton réseau et réessaie.");
  }

  // La roulette se lance ensuite d'elle-même : le rechargement voit la session passer à
  // « clôturée » avec decided_by = 'tirage' (voir loadSession).
  function handleClose() {
    runAction(async () => {
      await closeSession(id);
      setCloseStep("idle");
    }, "Impossible de clôturer le vote. Vérifie ton réseau et réessaie.");
  }

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (hasFailed || !session || !loadedAt) {
    return (
      <ErrorScreen
        title="Impossible de charger le vote"
        message="Vérifie ton réseau et réessaie."
        onRetry={retry}
      />
    );
  }
  if (spin) {
    return (
      <>
        <GroupTitle name={session.groupName} />
        <Roulette names={spin.names} winnerIndex={spin.winnerIndex} onDone={handleSpinDone} />
      </>
    );
  }
  if (!session.isOpen) {
    return <SessionResult session={session} now={loadedAt} styles={styles} />;
  }

  const { canClose } = session;
  // Participation recalculée avec le vote provisoire : « Il ne manque plus que toi » disparaît
  // dès le toucher, sans attendre le serveur.
  const participation = summarizeParticipation(
    session.members,
    voterIdsWithMe(
      session.voterIds,
      session.userId,
      proposals.some((proposal) => proposal.hasMyVote),
    ),
    session.userId,
  );
  const leading = getLeadingProposals(proposals);
  const tiedNames = leading.map((proposal) => proposal.name).join(", ");
  const hasVotes = proposals.some((proposal) => proposal.voteCount > 0);
  const leadLabel = leading.length > 1 ? "Ex æquo" : "En tête";
  const startedAt = formatTime(new Date(session.createdAt));
  // Clôturer devient l'action principale dès qu'il y a de quoi décider.
  const canCloseNow = canClose && proposals.length > 0;
  // Seul dans le groupe, le décompte des votants n'apprend rien.
  const showParticipation = proposals.length > 0 && session.members.length > 1;

  // Sans aucun plat, il n'y a rien d'autre à faire que proposer : le champ est déjà ouvert.
  const showField = isProposing || proposals.length === 0;

  function stopProposing() {
    setIsProposing(false);
    setDishName("");
    setNameError(null);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <GroupTitle name={session.groupName} />
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <View style={styles.cardHeader}>
              <Chip label="Vote en direct" hasDot />
              <Text style={styles.caption}>
                {session.organizerName
                  ? `lancé par ${session.organizerName} · ${startedAt}`
                  : `lancé à ${startedAt}`}
              </Text>
            </View>
            <Text style={styles.muted}>
              {proposals.length === 0
                ? "Pas encore de plat. Propose le premier !"
                : "Coche tout ce qui te tente."}
            </Text>

            {proposals.map((item) => {
              const isLeading = hasVotes && leading.includes(item);
              return (
                <View key={item.id} style={[styles.row, item.hasMyVote && styles.rowChecked]}>
                  <Pressable
                    style={styles.vote}
                    onPress={() => handleToggleVote(item)}
                    disabled={isBusy}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${item.name}, ${voteCountLabel(item.voteCount)}${
                      isLeading ? `, ${leadLabel.toLowerCase()}` : ""
                    }`}
                    accessibilityState={{ checked: item.hasMyVote, disabled: isBusy }}
                  >
                    <View style={[styles.checkbox, item.hasMyVote && styles.checkboxChecked]}>
                      {item.hasMyVote ? (
                        <Feather name="check" size={18} color={theme.colors.onPrimary} />
                      ) : null}
                    </View>
                    <View style={styles.dishText}>
                      <View style={styles.dishLine}>
                        <Text style={styles.dish}>{item.name}</Text>
                        {isLeading ? (
                          <Chip label={leadLabel} variant="accent" style={styles.leadChip} />
                        ) : null}
                      </View>
                      <Text style={styles.caption}>
                        {item.voterNames.length > 0
                          ? item.voterNames.join(", ")
                          : "Aucun vote pour l’instant"}
                      </Text>
                    </View>
                    <Text style={styles.count}>{item.voteCount}</Text>
                  </Pressable>
                  {item.isMine && item.voteCount === 0 ? (
                    <Pressable
                      onPress={() => handleRemove(item)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${item.name}`}
                      accessibilityState={{ disabled: isBusy }}
                      style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                    >
                      <Feather name="x" size={20} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </Card>

          {showParticipation ? (
            <Text style={styles.status}>
              {participationLine(participation, {
                canClose,
                organizerName: session.organizerName,
              })}
            </Text>
          ) : null}
          {canClose || (showParticipation && everyoneHasVoted(participation)) ? null : (
            <Text style={styles.status}>
              L’organisateur clôturera le vote quand tout le monde aura voté.
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {actionError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {actionError}
            </Text>
          ) : null}

          {closeStep === "idle" && showField ? (
            <>
              <TextField
                label="Proposer un plat"
                value={dishName}
                onChangeText={setDishName}
                error={nameError}
                placeholder="Bolognaise"
                autoCapitalize="sentences"
                autoFocus
                maxLength={PROPOSAL_NAME_MAX_LENGTH}
                editable={!isBusy}
                onSubmitEditing={handlePropose}
                submitBehavior="submit"
              />
              <PrimaryButton label="Ajouter ce plat" onPress={handlePropose} isLoading={isBusy} />
              {proposals.length > 0 ? (
                <TextButton label="Fermer" onPress={stopProposing} isDisabled={isBusy} />
              ) : null}
            </>
          ) : null}

          {closeStep === "idle" && !showField ? (
            <>
              {canCloseNow ? (
                <PrimaryButton
                  label="Clôturer le vote"
                  onPress={() => setCloseStep("confirm")}
                  isDisabled={isBusy || isVoting}
                />
              ) : null}
              <PrimaryButton
                label="Proposer un plat"
                variant={canCloseNow ? "secondary" : "primary"}
                onPress={() => setIsProposing(true)}
                isDisabled={isBusy}
              />
            </>
          ) : null}

          {closeStep === "confirm" ? (
            <>
              <Text style={styles.panelText}>
                {leading.length > 1 ? `Égalité entre ${tiedNames} : la roulette va trancher. ` : ""}
                Clôturer maintenant ? Plus personne ne pourra voter ni proposer.
              </Text>
              {/* Pas de clôture pendant l'envoi d'un vote : il serait refusé et perdu. */}
              <PrimaryButton
                label="Clôturer"
                onPress={() => handleClose()}
                isLoading={isBusy}
                isDisabled={isVoting}
              />
              <TextButton
                label="Annuler"
                onPress={() => setCloseStep("idle")}
                isDisabled={isBusy}
              />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type SessionResultProps = {
  session: VoteSession;
  now: Date;
  styles: ReturnType<typeof createStyles>;
};

function SessionResult({ session, now, styles }: SessionResultProps) {
  const { colors } = useTheme();
  const winner = session.proposals.find((proposal) => proposal.id === session.winnerProposalId);
  const winnerName = winner?.name ?? "Plat introuvable";
  const closedAt = session.closedAt ? new Date(session.closedAt) : null;
  const isTonight = closedAt !== null && isSameDay(closedAt, now);
  // Échelle des barres : le nombre de membres, ou plus si d'anciens membres avaient voté.
  const scale = Math.max(
    session.members.length,
    ...session.proposals.map((proposal) => proposal.voteCount),
    1,
  );

  let decision = session.decidedBy ? DECISION_LABELS[session.decidedBy] : null;
  if (session.decidedBy === "vote" && winner) {
    decision = `${decision} · ${voteCountLabel(winner.voteCount)}`;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <GroupTitle name={session.groupName} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Feather name="check" size={64} color={colors.onAccent} />
          </View>
          <Text style={styles.muted}>
            {closedAt ? `${session.groupName} · ${dayLabel(closedAt, now)}` : session.groupName}
          </Text>
          <Text style={styles.winner} accessibilityRole="header">
            {isTonight ? `Ce soir, c’est\n${winnerName} !` : winnerName}
          </Text>
          {decision ? <Chip label={decision} variant="accent" style={styles.leadChip} /> : null}
        </View>

        <Card>
          {session.proposals.map((proposal) => {
            const isWinner = proposal.id === winner?.id;
            return (
              <View
                key={proposal.id}
                style={styles.result}
                accessible
                accessibilityLabel={`${proposal.name}, ${voteCountLabel(proposal.voteCount)}${
                  isWinner ? ", gagnant" : ""
                }`}
              >
                <View style={styles.resultLine}>
                  <Text style={[styles.resultName, isWinner && styles.resultNameWinner]}>
                    {proposal.name}
                  </Text>
                  <Text style={styles.caption}>{voteCountLabel(proposal.voteCount)}</Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.bar,
                      isWinner && styles.barWinner,
                      { width: `${Math.round((proposal.voteCount / scale) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            );
          })}
          <Text style={styles.caption}>
            Barres sur {scale} personne{scale > 1 ? "s" : ""} : chacun pouvait cocher plusieurs
            plats.
          </Text>
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label="C’est réglé" onPress={() => router.dismissTo("/")} />
        <TextButton label="Retour au groupe" onPress={() => backToGroup(session.groupId)} />
      </View>
    </SafeAreaView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    content: { padding: spacing.xl, gap: spacing.lg },
    cardHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    caption: { color: colors.textMuted, fontSize: fontSize.caption },
    status: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingRight: spacing.sm,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
    },
    rowChecked: { borderColor: colors.brand, backgroundColor: colors.chipBg },
    vote: {
      flex: 1,
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
    },
    checkbox: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    // 44 : taille minimale d'une zone tactile.
    remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    pressed: { opacity: 0.6 },
    dishText: { flex: 1, gap: spacing.xs },
    dishLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
    dish: { flexShrink: 1, color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    leadChip: { alignSelf: "center" },
    count: {
      minWidth: 28,
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      textAlign: "right",
    },
    footer: {
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    panelText: { color: colors.text, fontSize: fontSize.body, lineHeight: 26 },
    error: { color: colors.danger, fontSize: fontSize.small },
    hero: { alignItems: "center", gap: spacing.md },
    badge: {
      width: 132,
      height: 132,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
    },
    winner: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.title,
      lineHeight: 42,
      textAlign: "center",
    },
    result: { gap: 6 },
    resultLine: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    resultName: { flexShrink: 1, color: colors.text, fontSize: fontSize.body, fontWeight: "500" },
    resultNameWinner: { fontWeight: "700" },
    track: {
      height: 10,
      overflow: "hidden",
      borderRadius: radius.pill,
      backgroundColor: colors.surface2,
    },
    bar: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.inputBorder },
    barWinner: { backgroundColor: colors.brand },
  });
}
