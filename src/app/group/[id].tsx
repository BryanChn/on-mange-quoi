import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { fetchGroup, type GroupDetail } from "@/lib/groups";
import { useTheme, type Theme } from "@/theme";

export default function GroupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const loadGroup = useCallback(() => {
    let isStale = false;

    fetchGroup(id).then(
      (loadedGroup) => {
        if (!isStale) setGroup(loadedGroup);
      },
      () => {
        if (!isStale) setHasFailed(true);
      },
    );

    return () => {
      isStale = true;
    };
  }, [id]);

  useEffect(() => loadGroup(), [loadGroup]);

  function retry() {
    setHasFailed(false);
    loadGroup();
  }

  async function handleShare(detail: GroupDetail) {
    setShareError(null);

    try {
      await Share.share({
        message: `Rejoins « ${detail.name} » sur On mange quoi ? avec le code ${detail.invite_code}`,
      });
    } catch {
      setShareError("Impossible d’ouvrir le partage. Note le code et transmets-le à la main.");
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

      <View style={styles.invite}>
        <Text style={styles.inviteLabel}>Code d’invitation</Text>
        <Text style={styles.inviteCode} selectable>
          {group.invite_code}
        </Text>
        <Text style={styles.inviteHint}>
          Envoie-le aux membres de ton groupe : ils le saisiront dans « Rejoindre avec un code ».
        </Text>
      </View>

      <PrimaryButton label="Partager le code" onPress={() => handleShare(group)} />
      {shareError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {shareError}
        </Text>
      ) : null}
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
