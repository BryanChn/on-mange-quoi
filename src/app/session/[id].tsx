import { router, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { Roulette } from "@/components/roulette";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
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
  type TieBreak,
  type VoteSession,
} from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne proposals.name.
const PROPOSAL_NAME_MAX_LENGTH = 60;

// Étapes de la clôture : confirmer, puis, en cas d'égalité, roulette ou choix manuel.
type CloseStep = "idle" | "confirm" | "tie" | "choose";

type Spin = { names: string[]; winnerIndex: number };

const DECISION_LABELS: Record<DecisionMethod, string> = {
  vote: "Le plus voté par le groupe.",
  tirage: "Tiré au sort parmi les ex æquo.",
  organisateur: "Départagé à la main parmi les ex æquo.",
};

function voteCountLabel(count: number): string {
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

export default function SessionScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<VoteSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [dishName, setDishName] = useState("");
  // Une action à la fois : un double appui ne doit pas cocher puis décocher.
  const [isBusy, setIsBusy] = useState(false);
  // Sous le champ : seulement ce qui concerne le nom tapé. Le reste (réseau, vote, retrait) à part.
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeStep, setCloseStep] = useState<CloseStep>("idle");
  const [spin, setSpin] = useState<Spin | null>(null);

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

  // L'écran ne change qu'après confirmation du serveur : on recharge plutôt que de supposer.
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

  function handleToggleVote(proposal: Proposal) {
    runAction(
      () => setVote(proposal.id, !proposal.hasMyVote),
      "Impossible d’enregistrer ton vote. Vérifie ton réseau et réessaie.",
    );
  }

  function handleRemove(proposal: Proposal) {
    runAction(async () => {
      const isRemoved = await removeProposal(proposal.id);
      if (!isRemoved)
        setActionError("Quelqu’un a déjà voté pour ce plat : il reste dans la liste.");
    }, "Impossible de retirer ce plat. Vérifie ton réseau et réessaie.");
  }

  function handleClose(tieBreak?: TieBreak) {
    runAction(async () => {
      const outcome = await closeSession(id, tieBreak);
      if (outcome === "tie") {
        setCloseStep("tie");
      } else if (outcome === "not_tied") {
        setCloseStep("confirm");
        setActionError("Les votes ont changé pendant ton choix : vérifie la liste et réessaie.");
      } else {
        setCloseStep("idle");
      }
    }, "Impossible de clôturer le vote. Vérifie ton réseau et réessaie.");
  }

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (hasFailed || !session) {
    return (
      <ErrorScreen
        title="Impossible de charger le vote"
        message="Vérifie ton réseau et réessaie."
        onRetry={retry}
      />
    );
  }
  if (spin) {
    return <Roulette names={spin.names} winnerIndex={spin.winnerIndex} onDone={handleSpinDone} />;
  }
  if (!session.isOpen) {
    return <SessionResult session={session} styles={styles} />;
  }

  const { proposals, canClose } = session;
  const leading = getLeadingProposals(proposals);
  const tiedNames = leading.map((proposal) => proposal.name).join(", ");

  // Sous la liste : le bouton de clôture pour qui peut clôturer, sinon qui le fera.
  let closeHint: ReactElement | undefined;
  if (closeStep === "idle" && canClose) {
    closeHint = (
      <View>
        <TextButton
          label="Clôturer le vote"
          onPress={() => setCloseStep("confirm")}
          isDisabled={isBusy || proposals.length === 0}
        />
        {proposals.length === 0 ? (
          <Text style={styles.hint}>Ajoute au moins un plat pour pouvoir clôturer.</Text>
        ) : null}
      </View>
    );
  } else if (closeStep === "idle") {
    closeHint = (
      <Text style={styles.hint}>
        L’organisateur clôturera le vote quand tout le monde aura voté.
      </Text>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          contentContainerStyle={styles.list}
          data={proposals}
          keyExtractor={(proposal) => proposal.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.title} accessibilityRole="header">
              On mange quoi ce soir ?
            </Text>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Pas encore de plat. Propose le premier !</Text>
          }
          ListFooterComponent={closeHint}
          renderItem={({ item }) => (
            <View style={[styles.row, item.hasMyVote && styles.rowChecked]}>
              <Pressable
                style={styles.vote}
                onPress={() => handleToggleVote(item)}
                disabled={isBusy}
                accessibilityRole="checkbox"
                accessibilityLabel={`${item.name}, ${voteCountLabel(item.voteCount)}`}
                accessibilityState={{ checked: item.hasMyVote, disabled: isBusy }}
              >
                <View style={[styles.checkbox, item.hasMyVote && styles.checkboxChecked]}>
                  {item.hasMyVote ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.dish}>{item.name}</Text>
                <Text style={styles.count}>{item.voteCount}</Text>
              </Pressable>
              {item.isMine && item.voteCount === 0 ? (
                <TextButton
                  label="Retirer"
                  onPress={() => handleRemove(item)}
                  isDisabled={isBusy}
                />
              ) : null}
            </View>
          )}
        />

        <View style={styles.form}>
          {actionError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {actionError}
            </Text>
          ) : null}

          {closeStep === "idle" ? (
            <>
              <TextField
                label="Proposer un plat"
                value={dishName}
                onChangeText={setDishName}
                error={nameError}
                placeholder="Bolognaise"
                autoCapitalize="sentences"
                maxLength={PROPOSAL_NAME_MAX_LENGTH}
                editable={!isBusy}
                onSubmitEditing={handlePropose}
                submitBehavior="submit"
              />
              <PrimaryButton label="Ajouter ce plat" onPress={handlePropose} isLoading={isBusy} />
            </>
          ) : null}

          {closeStep === "confirm" ? (
            <>
              <Text style={styles.panelText}>
                Clôturer maintenant ? Plus personne ne pourra voter ni proposer.
              </Text>
              <PrimaryButton label="Clôturer" onPress={() => handleClose()} isLoading={isBusy} />
              <TextButton
                label="Annuler"
                onPress={() => setCloseStep("idle")}
                isDisabled={isBusy}
              />
            </>
          ) : null}

          {closeStep === "tie" ? (
            <>
              <Text style={styles.panelText}>Égalité entre {tiedNames}. Comment départager ?</Text>
              <PrimaryButton
                label="Tirer au sort"
                onPress={() => handleClose({ method: "tirage" })}
                isLoading={isBusy}
              />
              <TextButton
                label="Choisir moi-même"
                onPress={() => setCloseStep("choose")}
                isDisabled={isBusy}
              />
              <TextButton
                label="Annuler"
                onPress={() => setCloseStep("idle")}
                isDisabled={isBusy}
              />
            </>
          ) : null}

          {closeStep === "choose" ? (
            <>
              <Text style={styles.panelText}>Quel plat parmi les ex æquo ?</Text>
              {leading.map((proposal) => (
                <TextButton
                  key={proposal.id}
                  label={proposal.name}
                  onPress={() => handleClose({ method: "organisateur", proposalId: proposal.id })}
                  isDisabled={isBusy}
                />
              ))}
              <TextButton label="Retour" onPress={() => setCloseStep("tie")} isDisabled={isBusy} />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type SessionResultProps = {
  session: VoteSession;
  styles: ReturnType<typeof createStyles>;
};

function SessionResult({ session, styles }: SessionResultProps) {
  const winner = session.proposals.find((proposal) => proposal.id === session.winnerProposalId);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.kicker} accessibilityRole="header">
          C’est réglé !
        </Text>
        <Text style={styles.winner}>{winner?.name ?? "Plat introuvable"}</Text>
        {session.decidedBy ? (
          <Text style={styles.empty}>{DECISION_LABELS[session.decidedBy]}</Text>
        ) : null}

        {session.proposals.map((proposal) => (
          <View
            key={proposal.id}
            style={[styles.row, styles.resultRow, proposal.id === winner?.id && styles.rowChecked]}
            accessible
            accessibilityLabel={`${proposal.name}, ${voteCountLabel(proposal.voteCount)}${
              proposal.id === winner?.id ? ", gagnant" : ""
            }`}
          >
            <Text style={styles.dish}>{proposal.name}</Text>
            <Text style={styles.count}>{proposal.voteCount}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.form}>
        <PrimaryButton label="Retour au groupe" onPress={() => backToGroup(session.groupId)} />
      </View>
    </SafeAreaView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    list: { padding: spacing.xl, gap: spacing.md },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    kicker: { color: colors.textMuted, fontSize: fontSize.body, fontWeight: "600" },
    winner: { fontFamily: fonts.display, fontSize: fontSize.title, color: colors.text },
    empty: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 26 },
    hint: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingRight: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    rowChecked: { borderColor: colors.primary },
    resultRow: { padding: spacing.lg },
    vote: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
    },
    checkbox: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: spacing.sm,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    checkmark: { color: colors.onPrimary, fontSize: fontSize.body, fontWeight: "700" },
    dish: { flex: 1, color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    count: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    form: {
      gap: spacing.md,
      padding: spacing.xl,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    panelText: { color: colors.text, fontSize: fontSize.body, lineHeight: 26 },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
