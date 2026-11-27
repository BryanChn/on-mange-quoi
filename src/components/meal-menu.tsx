import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
import type { MealVote, SoireeDetail } from "@/lib/soirees";
import { topicWords } from "@/lib/vote-topic";
import { useTheme, type Theme } from "@/theme";

type MealMenuProps = {
  soiree: SoireeDetail;
  userId: string | undefined;
  onOpenVote: (sessionId: string) => void;
};

// Le menu d'un repas « chez quelqu'un » : un vote par sujet, tous ouverts en même temps.
// Le bouton coloré dit la prochaine chose à faire (« Proposer », « Voter ») ; une fois voté, « Voir ».
// Quand le dernier vote se termine : « C'est décidé ! Au menu » avec les gagnants.
export function MealMenu({ soiree, userId, onOpenVote }: MealMenuProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDecided = soiree.step === "decide";
  const memberCount = soiree.members.length;

  function status(vote: MealVote): string {
    if (!vote.isOpen) return vote.winnerName ? "" : "Pas de proposition";
    // Sans proposition, il n'y a rien à voter : pas de compte de votants.
    if (vote.proposalCount === 0) return `Pas encore ${topicWords(vote.topic).of}`;
    const proposals = `${vote.proposalCount} proposition${vote.proposalCount > 1 ? "s" : ""}`;
    const voted = userId !== undefined && vote.voterIds.includes(userId);
    return voted
      ? `${proposals} · tu as voté`
      : `${proposals} · ${vote.voterIds.length}/${memberCount} ont voté`;
  }

  return (
    <SignatureCard>
      <View style={styles.top}>
        <View style={styles.topText}>
          <View style={styles.kicker}>
            {isDecided ? null : <View style={styles.dot} />}
            <Text style={styles.kickerText}>{isDecided ? "C’est décidé !" : "Votes en cours"}</Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {isDecided ? "Au menu" : "Le menu"}
          </Text>
        </View>
        <SignatureCat size={56} />
      </View>

      {soiree.menu.map((vote) => {
        const label = topicWords(vote.topic).label;
        const hasVoted = userId !== undefined && vote.voterIds.includes(userId);
        // Le bouton coloré : la prochaine chose à faire (proposer le premier, ou voter).
        const isNext = vote.isOpen && (!hasVoted || vote.proposalCount === 0);
        const line = status(vote);
        return (
          <Pressable
            key={vote.id}
            onPress={() => onOpenVote(vote.id)}
            accessibilityRole="button"
            accessibilityLabel={
              vote.isOpen
                ? `${label}, vote en cours. ${line}`
                : `${label} : ${vote.winnerName ?? "pas de proposition"}`
            }
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <Text style={styles.topic}>{label}</Text>
              {line ? <Text style={styles.status}>{line}</Text> : null}
            </View>
            {vote.isOpen ? (
              <View style={[styles.action, isNext && styles.actionNext]}>
                <Text style={[styles.actionText, isNext && styles.actionTextNext]}>
                  {vote.proposalCount === 0 ? "Proposer" : isNext ? "Voter" : "Voir"}
                </Text>
              </View>
            ) : vote.winnerName ? (
              <Text style={styles.winner} numberOfLines={2}>
                {vote.winnerName}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      {isDecided ? <Text style={styles.enjoy}>Bon appétit !</Text> : null}
    </SignatureCard>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    topText: { flex: 1, gap: spacing.xs },
    kicker: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.signatureButton,
    },
    kickerText: { color: colors.onSignatureMuted, fontSize: fontSize.small, fontWeight: "700" },
    title: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    // Une ligne par sujet : posée sur la carte signature, comme une carte dans la carte.
    row: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.md,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    topic: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.cardTitle },
    status: { color: colors.textMuted, fontSize: fontSize.caption },
    action: {
      minHeight: 44,
      minWidth: 76,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
    },
    actionNext: { backgroundColor: colors.primary },
    actionText: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.body },
    actionTextNext: { color: colors.onPrimary },
    winner: {
      maxWidth: "55%",
      textAlign: "right",
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.cardTitle,
    },
    enjoy: { color: colors.onSignatureMuted, fontSize: fontSize.small, textAlign: "center" },
  });
}
