import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { fetchGroup, type GroupDetail } from "@/lib/groups";
import { fetchLatestSession, startSession, type LatestSession } from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

export default function GroupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [latestSession, setLatestSession] = useState<LatestSession | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
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
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.xl, gap: spacing.xl },
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
  });
}
