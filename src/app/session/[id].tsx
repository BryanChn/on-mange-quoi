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
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { PrimaryButton } from "@/components/primary-button";
import { Roulette } from "@/components/roulette";
import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
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
  checkEntering,
  colorTransition,
  countEntering,
  dishEntering,
  dishExiting,
  dishLayout,
} from "@/lib/motion";
import { createSerialQueue } from "@/lib/serial-queue";
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
import { hapticConfirm, hapticReject, hapticToggle } from "@/lib/haptics";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne proposals.name.
const PROPOSAL_NAME_MAX_LENGTH = 60;
// Avatars de la participation : au-delà, la phrase dessous dit qui on attend.
const MAX_AVATARS = 6;

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
// avec push, la flèche retour du groupe ramènerait au résultat. Une soirée a son écran.
function backToGroup(session: Pick<VoteSession, "groupId" | "isSoiree">) {
  if (session.isSoiree) {
    router.dismissTo({ pathname: "/soiree/[id]", params: { id: session.groupId } });
  } else {
    router.dismissTo({ pathname: "/group/[id]", params: { id: session.groupId } });
  }
}

// Ce qu'on propose : un plat dans un foyer, un resto dans une soirée (« Où on mange ? »).
// Deux noms masculins : toutes les phrases de l'écran restent justes.
function itemNoun(session: Pick<VoteSession, "isSoiree"> | null): "plat" | "resto" {
  return session?.isSoiree ? "resto" : "plat";
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
  // pas arriver au serveur dans le désordre (l'état final serait faux). Une file par écran,
  // créée une seule fois (initialisation paresseuse de useState).
  const [enqueueVote] = useState(createSerialQueue);

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
          if (wasOpenRef.current && !loadedSession.isOpen) {
            // Clôture vue en direct : la roulette (tirage), ou le résultat tout de suite.
            if (loadedSession.decidedBy === "tirage") setSpin(spinFor(loadedSession));
            else hapticConfirm();
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
      hapticReject();
      if (isSessionClosedError(error)) {
        await loadSession();
      } else {
        setActionError(failureMessage);
      }
    } finally {
      setIsBusy(false);
    }
  }

  const noun = itemNoun(session);

  function handlePropose() {
    const cleanName = dishName.trim();
    if (cleanName === "") {
      setNameError(`Entre le nom d’un ${noun}.`);
      return;
    }

    runAction(async () => {
      const isAdded = await addProposal(id, cleanName);
      if (isAdded) {
        setDishName("");
      } else {
        hapticReject();
        setNameError(`Ce ${noun} est déjà proposé : coche-le dans la liste.`);
      }
    }, `Impossible d’ajouter ce ${noun}. Vérifie ton réseau et réessaie.`);
  }

  // proposal est le plat affiché, vote provisoire compris : un second toucher décoche.
  function handleToggleVote(proposal: Proposal) {
    const wantVote = !proposal.hasMyVote;
    setActionError(null);
    // Au toucher, avec la case qui se coche (vote optimiste) : jamais l'un sans l'autre.
    hapticToggle(wantVote);

    startVoting(async () => {
      applyMyVote({ proposalId: proposal.id, wantVote });
      try {
        await enqueueVote(() => setVote(proposal.id, wantVote));
        // La liste du serveur doit contenir le vote avant que le provisoire disparaisse.
        await loadSession();
      } catch (error) {
        hapticReject();
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
      if (!isRemoved) {
        hapticReject();
        setActionError(`Quelqu’un a déjà voté pour ce ${noun} : il reste dans la liste.`);
      }
    }, `Impossible de retirer ce ${noun}. Vérifie ton réseau et réessaie.`);
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
  const voterIds = voterIdsWithMe(
    session.voterIds,
    session.userId,
    proposals.some((proposal) => proposal.hasMyVote),
  );
  const participation = summarizeParticipation(session.members, voterIds, session.userId);
  const leading = getLeadingProposals(proposals);
  const tiedNames = leading.map((proposal) => proposal.name).join(", ");
  const hasVotes = proposals.some((proposal) => proposal.voteCount > 0);
  const leadLabel = leading.length > 1 ? "Ex æquo" : "En tête";
  const startedAt = formatTime(new Date(session.createdAt));
  const canCloseNow = canClose && proposals.length > 0;
  // Seul dans le groupe, le décompte des votants n'apprend rien.
  const showParticipation = proposals.length > 0 && session.members.length > 1;
  // Le bouton principal dit l'étape attendue : proposer tant qu'on attend quelqu'un, clôturer
  // quand tout le monde a voté. Clôturer reste possible avant, en lien texte.
  const isTimeToClose = canCloseNow && (!showParticipation || everyoneHasVoted(participation));

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
                ? `Pas encore de ${noun}. Propose le premier !`
                : "Coche tout ce qui te tente."}
            </Text>

            {/* skipEntering : les plats déjà là à l'ouverture ne s'animent pas, seuls les
                plats ajoutés ensuite apparaissent en fondu. */}
            <LayoutAnimationConfig skipEntering>
              {proposals.map((item) => {
                const isLeading = hasVotes && leading.includes(item);
                return (
                  <Animated.View
                    key={item.id}
                    entering={dishEntering}
                    exiting={dishExiting}
                    layout={dishLayout}
                    style={[styles.row, colorTransition, item.hasMyVote && styles.rowChecked]}
                  >
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
                      <Animated.View
                        style={[
                          styles.checkbox,
                          colorTransition,
                          item.hasMyVote && styles.checkboxChecked,
                        ]}
                      >
                        {item.hasMyVote ? (
                          <Animated.View entering={checkEntering}>
                            <Feather name="check" size={18} color={theme.colors.onPrimary} />
                          </Animated.View>
                        ) : null}
                      </Animated.View>
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
                      {/* Clé = le nombre : un nouveau compteur remplace l'ancien et arrive en
                        fondu, on voit le vote des autres arriver en direct. */}
                      <Animated.Text
                        key={item.voteCount}
                        entering={countEntering}
                        style={styles.count}
                      >
                        {item.voteCount}
                      </Animated.Text>
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
                  </Animated.View>
                );
              })}
            </LayoutAnimationConfig>
          </Card>

          {showParticipation ? (
            <View style={styles.participation}>
              <View style={styles.avatars}>
                {session.members.slice(0, MAX_AVATARS).map((member) => (
                  <Avatar
                    key={member.id}
                    name={member.name}
                    avatar={member.avatar}
                    photoPath={member.photoPath}
                    size={36}
                    isPending={!voterIds.includes(member.id)}
                  />
                ))}
              </View>
              <Text style={styles.participationText}>
                {participationLine(participation, {
                  canClose,
                  organizerName: session.organizerName,
                })}
              </Text>
              {canClose || everyoneHasVoted(participation) ? null : (
                <Text style={styles.status}>
                  L’organisateur clôturera le vote quand tout le monde aura voté.
                </Text>
              )}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {actionError ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {actionError}
            </Text>
          ) : null}

          {closeStep === "idle" && showField ? (
            <>
              <TextField
                label={`Proposer un ${noun}`}
                value={dishName}
                onChangeText={setDishName}
                error={nameError}
                placeholder={session.isSoiree ? "Pizza Roma" : "Bolognaise"}
                autoCapitalize="sentences"
                autoFocus
                maxLength={PROPOSAL_NAME_MAX_LENGTH}
                editable={!isBusy}
                onSubmitEditing={handlePropose}
                submitBehavior="submit"
              />
              <PrimaryButton
                label={`Ajouter ce ${noun}`}
                onPress={handlePropose}
                isLoading={isBusy}
              />
              {proposals.length > 0 ? (
                <TextButton label="Fermer" onPress={stopProposing} isDisabled={isBusy} />
              ) : null}
            </>
          ) : null}

          {closeStep === "idle" && !showField && isTimeToClose ? (
            <>
              <PrimaryButton
                label="Clôturer le vote"
                onPress={() => setCloseStep("confirm")}
                isDisabled={isBusy || isVoting}
              />
              <PrimaryButton
                label={`Proposer un ${noun}`}
                variant="secondary"
                onPress={() => setIsProposing(true)}
                isDisabled={isBusy}
              />
            </>
          ) : null}

          {closeStep === "idle" && !showField && !isTimeToClose ? (
            <>
              <PrimaryButton
                label={`Proposer un ${noun}`}
                onPress={() => setIsProposing(true)}
                isDisabled={isBusy}
              />
              {canCloseNow ? (
                <TextButton
                  label="Clôturer quand même"
                  onPress={() => setCloseStep("confirm")}
                  isDisabled={isBusy || isVoting}
                />
              ) : null}
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
  const winner = session.proposals.find((proposal) => proposal.id === session.winnerProposalId);
  const winnerName = winner?.name ?? (session.isSoiree ? "Resto introuvable" : "Plat introuvable");
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
        <SignatureCard style={styles.hero}>
          <SignatureCat size={96} />
          <Text style={styles.heroLabel}>
            {closedAt ? `${session.groupName} · ${dayLabel(closedAt, now)}` : session.groupName}
          </Text>
          <Text style={styles.winner} accessibilityRole="header">
            {isTonight ? `Ce soir, c’est\n${winnerName} !` : winnerName}
          </Text>
          {decision ? <Chip label={decision} variant="accent" style={styles.leadChip} /> : null}
          <Text style={styles.heroLabel}>Bon appétit !</Text>
        </SignatureCard>

        <Card>
          {session.proposals.map((proposal) => {
            const isWinner = proposal.id === winner?.id;
            return (
              <View
                key={proposal.id}
                style={styles.result}
                accessible
                accessibilityLabel={`${proposal.name}, ${proposal.voteCount} sur ${scale}${
                  isWinner ? ", gagnant" : ""
                }`}
              >
                <View style={styles.resultLine}>
                  <Text style={[styles.resultName, isWinner && styles.resultNameWinner]}>
                    {proposal.name}
                  </Text>
                  {/* « 2 sur 3 » : chacun pouvait cocher plusieurs plats, la barre se lit seule. */}
                  <Text style={styles.caption}>
                    {proposal.voteCount} sur {scale}
                  </Text>
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
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        {session.isSoiree ? (
          // Le resto est choisi : la suite, c'est la commande de chacun.
          <PrimaryButton label="Écrire ma commande" onPress={() => backToGroup(session)} />
        ) : (
          <>
            <PrimaryButton label="C’est décidé" onPress={() => router.dismissTo("/")} />
            <TextButton label="Retour au groupe" onPress={() => backToGroup(session)} />
          </>
        )}
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
    dish: { flexShrink: 1, color: colors.text, fontFamily: fonts.displayBold, fontSize: 19 },
    participation: {
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.border,
    },
    avatars: { flexDirection: "row", gap: spacing.sm },
    participationText: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: "600",
      textAlign: "center",
    },
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
    hero: { alignItems: "center", paddingVertical: spacing.xl },
    heroLabel: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    winner: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
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
