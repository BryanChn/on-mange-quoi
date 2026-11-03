import { useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { addProposal, fetchProposals, removeProposal, setVote, type Proposal } from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

// Même limite que la colonne proposals.name.
const PROPOSAL_NAME_MAX_LENGTH = 60;

export default function SessionScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [dishName, setDishName] = useState("");
  // Une action à la fois : un double appui ne doit pas cocher puis décocher.
  const [isBusy, setIsBusy] = useState(false);
  // Sous le champ : seulement ce qui concerne le nom tapé. Le reste (réseau, vote, retrait) à part.
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadProposals = useCallback(() => {
    return fetchProposals(id)
      .then(
        (loadedProposals) => {
          setProposals(loadedProposals);
          setHasFailed(false);
        },
        () => setHasFailed(true),
      )
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  function retry() {
    setIsLoading(true);
    loadProposals();
  }

  // L'écran ne change qu'après confirmation du serveur : on recharge plutôt que de supposer.
  async function runAction(action: () => Promise<void>, failureMessage: string) {
    setNameError(null);
    setActionError(null);
    setIsBusy(true);

    try {
      await action();
      await loadProposals();
    } catch {
      setActionError(failureMessage);
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

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (hasFailed) {
    return (
      <ErrorScreen
        title="Impossible de charger le vote"
        message="Vérifie ton réseau et réessaie."
        onRetry={retry}
      />
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
          renderItem={({ item }) => (
            <View style={[styles.row, item.hasMyVote && styles.rowChecked]}>
              <Pressable
                style={styles.vote}
                onPress={() => handleToggleVote(item)}
                disabled={isBusy}
                accessibilityRole="checkbox"
                accessibilityLabel={`${item.name}, ${item.voteCount} vote${item.voteCount > 1 ? "s" : ""}`}
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    list: { padding: spacing.xl, gap: spacing.md },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    empty: { color: colors.textMuted, fontSize: fontSize.body, lineHeight: 26 },
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
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
