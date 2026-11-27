import { router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { MomentPicker } from "@/components/moment-picker";
import { PrimaryButton } from "@/components/primary-button";
import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
import {
  idleLine,
  leadingTitle,
  momentLabel,
  summarizeParticipation,
  voteProgressLabel,
  type HomeGroup,
  type MealMoment,
  type Tonight,
} from "@/lib/tonight";
import { useTheme, type Theme } from "@/theme";

// Au-delà, les avatars déborderaient de la carte : le texte à côté dit qui manque.
const MAX_AVATARS = 5;
// Le chat de la carte signature : présent sans manger la place du titre.
const CAT_SIZE = 64;

function openSession(sessionId: string) {
  router.push({ pathname: "/session/[id]", params: { id: sessionId } });
}

type TonightCardProps = {
  tonight: Tonight;
  // Le groupe de la carte : son nom en tête (« CE SOIR · FAMILLE »).
  group: HomeGroup;
  userId: string;
  now: Date;
  isStarting: boolean;
  error: string | null;
  // Midi ou soir du prochain vote (pastille de la carte « rien de prévu »).
  moment: MealMoment;
  onMomentChange: (moment: MealMoment) => void;
  onStart: (group: HomeGroup) => void;
};

// La carte « Ce soir » d'un groupe : l'action du moment, en un appui. Vote en cours : carte
// neutre, son contenu (plats, votants) est ce qu'il faut lire. Décidé ou rien de prévu : la
// carte signature, avec le chat.
export function TonightCard({
  tonight,
  group,
  userId,
  now,
  isStarting,
  error,
  moment,
  onMomentChange,
  onStart,
}: TonightCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (tonight.kind === "open") {
    const { session, hasMyVote } = tonight;
    const participation = summarizeParticipation(group.members, session.voterIds, userId);
    const hasProposals = session.proposals.length > 0;
    // Sans plat, personne ne peut voter ; seul dans le groupe, il n'y a personne à attendre.
    const showVoters = hasProposals && group.members.length > 1;
    const isDone = hasProposals && hasMyVote;

    return (
      <Card style={styles.fill}>
        <View style={styles.kickerRow}>
          <View style={styles.liveDot} />
          <Text style={styles.kicker}>Vote en cours · {group.name}</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {leadingTitle(session.proposals)}
        </Text>
        <Text style={styles.muted}>
          {voteProgressLabel(session.proposals.length, participation)}
        </Text>
        {showVoters ? (
          <View style={styles.voters}>
            <View style={styles.avatars}>
              {group.members.slice(0, MAX_AVATARS).map((member, index) => (
                <View
                  key={member.id}
                  style={[styles.avatarRing, index > 0 && styles.avatarOverlap]}
                >
                  <Avatar
                    name={member.name}
                    avatar={member.avatar}
                    photoPath={member.photoPath}
                    size={28}
                    isPending={!session.voterIds.includes(member.id)}
                  />
                </View>
              ))}
            </View>
            <Text style={[styles.muted, styles.votersLabel]} numberOfLines={2}>
              {participation.pendingLabel}
            </Text>
          </View>
        ) : null}
        <PrimaryButton
          label={!hasProposals ? "Proposer un plat" : isDone ? "Voir le vote" : "Voter"}
          variant={isDone ? "secondary" : "primary"}
          size="md"
          onPress={() => openSession(session.id)}
          style={styles.bottom}
        />
      </Card>
    );
  }

  if (tonight.kind === "decided") {
    const { session } = tonight;

    return (
      <SignatureCard style={styles.fill}>
        <View style={styles.signatureTop}>
          <View style={styles.signatureText}>
            <Text style={styles.signatureKicker}>
              {momentLabel(session.moment)} · {group.name}
            </Text>
            <Text style={styles.signatureTitle} accessibilityRole="header">
              C’est {session.winnerName} !
            </Text>
            <Text style={styles.signatureMuted}>Bon appétit !</Text>
          </View>
          <SignatureCat size={CAT_SIZE} />
        </View>
        <PrimaryButton
          label="Voir le résultat"
          variant="signature"
          size="md"
          onPress={() => openSession(session.id)}
          style={styles.bottom}
        />
      </SignatureCard>
    );
  }

  return (
    <View style={[styles.fill, styles.idle]}>
      <SignatureCard style={styles.fill}>
        <View style={styles.signatureTop}>
          <View style={styles.signatureText}>
            <Text style={styles.signatureKicker}>
              {momentLabel(moment)} · {group.name}
            </Text>
            <Text style={styles.signatureTitle} accessibilityRole="header">
              Rien de prévu
            </Text>
            <Text style={styles.signatureMuted}>{idleLine(now)}</Text>
          </View>
          <SignatureCat size={CAT_SIZE} />
        </View>
        <View style={[styles.idleActions, styles.bottom]}>
          <PrimaryButton
            label="Lancer le vote"
            variant="signature"
            size="md"
            onPress={() => onStart(group)}
            isLoading={isStarting}
          />
          <MomentPicker
            value={moment}
            onChange={onMomentChange}
            tone="signature"
            isDisabled={isStarting}
          />
        </View>
      </SignatureCard>
      {/* Sous la carte : la couleur d'erreur ne se lit pas sur la tomate. */}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  const kicker = {
    fontSize: fontSize.caption,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  } as const;
  return StyleSheet.create({
    // Dans le carrousel, toutes les cartes prennent la hauteur de la plus haute.
    fill: { flexGrow: 1 },
    // Le bouton reste en bas de la carte, même quand une voisine est plus haute.
    bottom: { marginTop: "auto" },
    kickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
    kicker: { ...kicker, color: colors.chipText },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 28,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    idle: { gap: spacing.sm },
    idleActions: { gap: spacing.md },
    signatureTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    signatureText: { flex: 1, gap: spacing.xs + 2 },
    signatureKicker: { ...kicker, color: colors.onSignatureMuted, opacity: 0.85 },
    signatureTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 28,
    },
    signatureMuted: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    voters: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    votersLabel: { flex: 1 },
    avatars: { flexDirection: "row" },
    // Anneau de la couleur de la carte : sépare deux avatars qui se chevauchent.
    avatarRing: { borderWidth: 2, borderColor: colors.surface, borderRadius: radius.pill },
    avatarOverlap: { marginLeft: -spacing.sm },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
