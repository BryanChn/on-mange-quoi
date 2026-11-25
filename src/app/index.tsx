import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { InitialTile, ListCard, ListRow } from "@/components/list";
import { MomentPicker } from "@/components/moment-picker";
import { PrimaryButton } from "@/components/primary-button";
import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
import { StatusBarBackdrop } from "@/components/status-bar-backdrop";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { UpdateBanner } from "@/components/update-banner";
import { TextButton } from "@/components/text-button";
import { getInitial } from "@/lib/avatar";
import { fetchHome, subscribeToHome, type Home, type HomeSoiree } from "@/lib/home";
import {
  defaultMoment,
  groupSubtitle,
  idleLine,
  leadingTitle,
  momentLabel,
  pickTonight,
  summarizeParticipation,
  voteProgressLabel,
  type HomeGroup,
  type MealMoment,
  type Tonight,
} from "@/lib/tonight";
import { useProfile } from "@/lib/profile";
import { shoppingShortcut } from "@/lib/shopping-rules";
import { capitalize } from "@/lib/vote-topic";
import { startSession } from "@/lib/votes";
import { useTheme, type Theme } from "@/theme";

// Au-delà, les avatars déborderaient de la carte : le texte à côté dit qui manque.
const MAX_AVATARS = 5;
// Le chat de la carte signature : assez grand pour être vu, sans manger la place du titre.
const CAT_SIZE = 72;

// loadedAt : « aujourd'hui » au moment du chargement. Lire l'horloge pendant le rendu le
// rendrait impur ; la date voyage donc avec les données.
type LoadedHome = Home & { loadedAt: Date };

type Styles = ReturnType<typeof createStyles>;

function openSession(sessionId: string) {
  router.push({ pathname: "/session/[id]", params: { id: sessionId } });
}

export default function Index() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const [home, setHome] = useState<LoadedHome | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  // Midi ou soir touché par l'utilisateur ; null : la présélection selon l'heure du chargement.
  const [chosenMoment, setChosenMoment] = useState<MealMoment | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran
  // (le temps réel peut en lancer plusieurs coup sur coup).
  const latestRequestRef = useRef(0);

  const loadHome = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    fetchHome().then(
      (loadedHome) => {
        if (latestRequestRef.current !== requestId) return;
        setHome({ ...loadedHome, loadedAt: new Date() });
        setHasFailed(false);
      },
      () => {
        if (latestRequestRef.current !== requestId) return;
        setHasFailed(true);
      },
    );
  }, []);

  // À chaque retour sur l'écran : recharger (un groupe créé, un vote clôturé ailleurs),
  // puis suivre les votes en direct. Le désabonnement se fait en quittant l'écran.
  useFocusEffect(
    useCallback(() => {
      loadHome();
      return subscribeToHome(loadHome);
    }, [loadHome]),
  );

  function retry() {
    setHasFailed(false);
    loadHome();
  }

  // Sans choix, l'heure du dernier chargement décide (pas l'horloge lue au rendu).
  const moment: MealMoment = chosenMoment ?? (home ? defaultMoment(home.loadedAt) : "soir");

  async function handleStart(group: HomeGroup) {
    setStartError(null);
    setIsStarting(true);

    try {
      openSession(await startSession(group.id, moment));
      setChosenMoment(null);
    } catch {
      setStartError("Le vote n’a pas démarré : vérifie ta connexion et réessaie.");
    } finally {
      setIsStarting(false);
    }
  }

  // Un rechargement raté alors que l'écran est déjà affiché ne le remplace pas par une
  // erreur : on garde les dernières données, le prochain changement réessaiera.
  if (!home) {
    return hasFailed ? (
      <ErrorScreen
        title="On n’arrive pas à charger l’accueil"
        message="Vérifie ta connexion et réessaie."
        onRetry={retry}
        canSignOut
      />
    ) : (
      <LoadingScreen />
    );
  }

  const displayName = profile?.display_name ?? "";
  const hasGroups = home.groups.length > 0;
  const shopping = shoppingShortcut(home.groups, home.toBuyByGroup);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing.xl,
            paddingBottom: insets.bottom + theme.spacing.xl,
          },
          !hasGroups && styles.contentEmpty,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">
              <Text style={styles.titleName}>Salut {displayName}</Text>
              {hasGroups ? `,\non mange quoi ${momentLabel(defaultMoment(home.loadedAt))} ?` : null}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/account")}
            accessibilityRole="button"
            accessibilityLabel="Mon compte"
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Avatar
              name={displayName}
              avatar={profile?.avatar}
              photoPath={profile?.photo_path}
              size={44}
            />
          </Pressable>
        </View>

        <UpdateBanner />

        {/* Une soirée en cours passe avant « Ce soir » : elle a une échéance. Carte blanche,
          pour ne pas concurrencer la carte de couleur. */}
        {home.soirees.map((soiree) => (
          <SoireeCard key={soiree.id} soiree={soiree} styles={styles} />
        ))}

        {hasGroups ? (
          <>
            <TonightCard
              tonight={pickTonight(home.groups, home.userId, home.loadedAt)}
              userId={home.userId}
              now={home.loadedAt}
              isStarting={isStarting}
              error={startError}
              moment={moment}
              onMomentChange={setChosenMoment}
              onStart={handleStart}
              styles={styles}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Tes groupes
              </Text>
              <ListCard>
                {home.groups.map((group) => (
                  <ListRow
                    key={group.id}
                    label={group.name}
                    subtitle={groupSubtitle(group, home.loadedAt)}
                    leading={<InitialTile initial={getInitial(group.name)} />}
                    hasChevron
                    onPress={() =>
                      router.push({ pathname: "/group/[id]", params: { id: group.id } })
                    }
                  />
                ))}
                {/* Une seule ligne de courses, même avec plusieurs foyers : pas de liste qui
                    envahit l'accueil. Une liste à faire : elle s'ouvre directement. */}
                {shopping.kind === "none" ? null : (
                  <ListRow
                    icon="shopping-cart"
                    label="Liste de courses"
                    subtitle={shopping.subtitle}
                    hasChevron
                    onPress={() =>
                      shopping.kind === "one"
                        ? router.push({
                            pathname: "/courses/[groupId]",
                            params: { groupId: shopping.groupId },
                          })
                        : router.push("/courses")
                    }
                  />
                )}
                <ListRow
                  icon="star"
                  label="Organiser un repas"
                  subtitle="Commande, resto, ou chez quelqu’un"
                  onPress={() => router.push("/soiree/new")}
                />
                <ListRow
                  icon="plus"
                  label="Créer un groupe"
                  onPress={() => router.push("/create-group")}
                />
                <ListRow
                  icon="hash"
                  label="Rejoindre avec un code"
                  onPress={() => router.push("/join-group")}
                />
              </ListCard>
            </View>
          </>
        ) : (
          <EmptyHome styles={styles} />
        )}
      </ScrollView>
      <StatusBarBackdrop />
    </>
  );
}

type TonightCardProps = {
  tonight: Tonight;
  userId: string;
  now: Date;
  isStarting: boolean;
  error: string | null;
  // Midi ou soir du prochain vote (pastille de la carte « rien de prévu »).
  moment: MealMoment;
  onMomentChange: (moment: MealMoment) => void;
  onStart: (group: HomeGroup) => void;
  styles: Styles;
};

// La carte « Ce soir » : l'action du moment, en un appui.
function TonightCard({
  tonight,
  userId,
  now,
  isStarting,
  error,
  moment,
  onMomentChange,
  onStart,
  styles,
}: TonightCardProps) {
  if (tonight.kind === "open") {
    const { group, session, hasMyVote } = tonight;
    const participation = summarizeParticipation(group.members, session.voterIds, userId);
    const hasProposals = session.proposals.length > 0;
    // Sans plat, personne ne peut voter ; seul dans le groupe, il n'y a personne à attendre.
    const showVoters = hasProposals && group.members.length > 1;
    const isDone = hasProposals && hasMyVote;

    return (
      <Card>
        <Chip label={`${group.name} · vote en cours`} hasDot />
        <Text style={styles.cardTitle} accessibilityRole="header">
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
                    isPending={!session.voterIds.includes(member.id)}
                  />
                </View>
              ))}
            </View>
            <Text style={[styles.muted, styles.votersLabel]}>{participation.pendingLabel}</Text>
          </View>
        ) : null}
        <PrimaryButton
          label={!hasProposals ? "Proposer un plat" : isDone ? "Voir le vote" : "Voter"}
          variant={isDone ? "secondary" : "primary"}
          onPress={() => openSession(session.id)}
        />
      </Card>
    );
  }

  // C'est décidé et rien de prévu : la carte signature, avec le chat. Le vote en cours reste
  // une carte neutre, son contenu (plats, votants) est ce qu'il faut lire.
  if (tonight.kind === "decided") {
    const { group, session } = tonight;

    return (
      <SignatureCard>
        <View style={styles.signatureTop}>
          <View style={styles.signatureText}>
            <Chip label={`${group.name} · c’est décidé`} variant="accent" />
            <Text style={styles.signatureTitle} accessibilityRole="header">
              {capitalize(momentLabel(session.moment))}, c’est {session.winnerName} !
            </Text>
            <Text style={styles.signatureMuted}>Bon appétit !</Text>
          </View>
          <SignatureCat size={CAT_SIZE} />
        </View>
        <PrimaryButton
          label="Voir le résultat"
          variant="signature"
          onPress={() => openSession(session.id)}
        />
      </SignatureCard>
    );
  }

  const { groupToStart } = tonight;

  return (
    <View style={styles.tonight}>
      <SignatureCard>
        <View style={styles.signatureTop}>
          <View style={styles.signatureText}>
            <Text style={styles.signatureTitle} accessibilityRole="header">
              Rien de prévu {momentLabel(moment)}
            </Text>
            <Text style={styles.signatureMuted}>
              {groupToStart ? idleLine(now) : "Choisis un groupe ci-dessous pour lancer le vote."}
            </Text>
          </View>
          <SignatureCat size={CAT_SIZE} />
        </View>
        {groupToStart ? (
          <>
            <MomentPicker
              value={moment}
              onChange={onMomentChange}
              tone="signature"
              isDisabled={isStarting}
            />
            <PrimaryButton
              label="Lancer le vote"
              variant="signature"
              onPress={() => onStart(groupToStart)}
              isLoading={isStarting}
            />
          </>
        ) : null}
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

// Premier lancement : aucun groupe. Une assiette vide, et les deux façons d'en avoir un.
// L'étiquette de la carte d'un repas : où il en est, selon sa façon de faire.
function soireeLabel(soiree: Pick<HomeSoiree, "step" | "mode">): string {
  if (soiree.step === "commande") return "Commande ouverte";
  if (soiree.step === "passee") return "Commande passée";
  if (soiree.mode === "maison") return soiree.step === "decide" ? "Menu décidé" : "Le menu se vote";
  return soiree.step === "decide" ? "C’est décidé" : "Où on mange ?";
}

// Une soirée en cours : son étape, qui vient. S'ouvre au toucher.
function SoireeCard({ soiree, styles }: { soiree: HomeSoiree; styles: Styles }) {
  const count = soiree.members.length;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/soiree/[id]", params: { id: soiree.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Repas ${soiree.name}, ${soireeLabel(soiree)}, ${count} ${count > 1 ? "personnes" : "personne"}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card>
        <View style={styles.soireeTop}>
          <Chip
            label={soireeLabel(soiree)}
            hasDot={soiree.step === "choix" || soiree.step === "commande"}
          />
          <Text style={styles.muted}>
            {count} {count > 1 ? "personnes" : "personne"}
          </Text>
        </View>
        <Text style={styles.cardTitle}>{soiree.name}</Text>
        <View style={styles.avatars}>
          {soiree.members.slice(0, MAX_AVATARS).map((member, index) => (
            <View key={member.id} style={[styles.avatarRing, index > 0 && styles.avatarOverlap]}>
              <Avatar
                name={member.name}
                avatar={member.avatar}
                photoPath={member.photoPath}
                size={28}
              />
            </View>
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

function EmptyHome({ styles }: { styles: Styles }) {
  return (
    <View style={styles.empty}>
      <View style={styles.plate}>
        <View style={styles.plateInner} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        Il te manque{"\n"}une tablée
      </Text>
      <Text style={styles.emptyText}>
        Crée ton foyer et invite ceux qui mangent avec toi. Ça prend 20 secondes.
      </Text>
      <View style={styles.emptyActions}>
        <PrimaryButton label="Créer un groupe" onPress={() => router.push("/create-group")} />
        <TextButton label="Rejoindre avec un code" onPress={() => router.push("/join-group")} />
        <TextButton label="Organiser un repas" onPress={() => router.push("/soiree/new")} />
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.xl, gap: spacing.xl },
    contentEmpty: { flexGrow: 1 },
    pressed: { opacity: 0.6 },
    header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    headerText: { flex: 1, gap: spacing.xs },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
    },
    // Le prénom en tomate : la seule touche de couleur du titre.
    titleName: { color: colors.brand },
    cardTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    tonight: { gap: spacing.sm },
    signatureTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    signatureText: { flex: 1, gap: spacing.sm },
    signatureTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    signatureMuted: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    voters: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    votersLabel: { flex: 1 },
    avatars: { flexDirection: "row" },
    // Anneau de la couleur de la carte : sépare deux avatars qui se chevauchent.
    avatarRing: { borderWidth: 2, borderColor: colors.surface, borderRadius: radius.pill },
    avatarOverlap: { marginLeft: -spacing.sm },
    error: { color: colors.danger, fontSize: fontSize.small },
    soireeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    section: { gap: spacing.md },
    sectionTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
    plate: {
      width: 150,
      height: 150,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 6,
      borderColor: colors.brand,
    },
    plateInner: {
      width: 86,
      height: 86,
      borderRadius: radius.pill,
      borderWidth: 6,
      borderColor: colors.brand,
    },
    emptyTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
      textAlign: "center",
    },
    emptyText: {
      maxWidth: 300,
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: 24,
      textAlign: "center",
    },
    emptyActions: { alignSelf: "stretch", gap: spacing.xs, marginTop: spacing.lg },
  });
}
