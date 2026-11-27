import { Feather } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { HelpButton, HelpCard } from "@/components/help-card";
import { ListCard, ListRow } from "@/components/list";
import { MealContributions } from "@/components/meal-contributions";
import { MealMenu } from "@/components/meal-menu";
import { MealNotificationsRow } from "@/components/meal-notifications-row";
import { PrimaryButton } from "@/components/primary-button";
import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
import { SoireeOrder } from "@/components/soiree-order";
import { StatusBarBackdrop } from "@/components/status-bar-backdrop";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { deleteGroup, leaveGroup } from "@/lib/groups";
import { signOut } from "@/lib/notifications";
import { formatShortDay } from "@/lib/meal-date";
import { shareOrderText, shareSoiree } from "@/lib/share-soiree";
import { contributionsByPerson, decidedText, goingTo } from "@/lib/soiree-rules";
import { useSession } from "@/lib/session";
import {
  chooseRestaurant,
  fetchSoiree,
  removeParticipant,
  soireeLink,
  subscribeToSoiree,
  type SoireeDetail,
  type SoireeMember,
  type SoireeMode,
  type SoireeStep,
} from "@/lib/soirees";
import {
  fetchLatestSession,
  startSession,
  subscribeToGroupSessions,
  type LatestSession,
} from "@/lib/votes";
import { topicWords } from "@/lib/vote-topic";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import { useHelp } from "@/lib/use-help";
import { useTheme, type Theme } from "@/theme";

type Styles = ReturnType<typeof createStyles>;

// Une confirmation à la fois : retirer quelqu'un, quitter, supprimer.
type Confirm =
  | { kind: "none" }
  | { kind: "remove"; member: SoireeMember }
  | { kind: "leave" }
  | { kind: "delete" };

// Même limite que la colonne proposals.name / groups.restaurant.
const RESTAURANT_MAX_LENGTH = 60;

// Les étapes affichées sous le titre, selon la façon de faire le repas.
function stepsFor(mode: SoireeMode): { step: SoireeStep; label: string }[] {
  if (mode === "resto") {
    return [
      { step: "choix", label: "Où on mange" },
      { step: "decide", label: "C’est décidé" },
    ];
  }
  if (mode === "maison") {
    return [
      { step: "choix", label: "Le menu" },
      { step: "decide", label: "C’est décidé" },
    ];
  }
  return [
    { step: "choix", label: "Où on mange" },
    { step: "commande", label: "Commande" },
    { step: "passee", label: "Passée" },
  ];
}

// Ce qu'un invité fait sans l'app, pour la carte « Invite tes amis ».
const INVITE_PURPOSE: Record<SoireeMode, string> = {
  commande: "pour commander",
  resto: "pour voter",
  maison: "pour voter le menu et dire ce qu’il apporte",
};

export default function SoireeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous === true;

  const [soiree, setSoiree] = useState<SoireeDetail | null>(null);
  const [latestSession, setLatestSession] = useState<LatestSession | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSharingDecided, setIsSharingDecided] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [restaurant, setRestaurant] = useState("");
  const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>({ kind: "none" });
  const [isConfirming, setIsConfirming] = useState(false);

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);
  // Inviter sans l'app, le code, qui apporte quoi : ce qui ne se devine pas (membres seulement).
  const help = useHelp("repas");
  const scrollRef = useRef<ScrollViewInstance>(null);

  const loadSoiree = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    Promise.all([fetchSoiree(id), fetchLatestSession(id)]).then(
      ([loaded, loadedSession]) => {
        if (latestRequestRef.current !== requestId) return;
        setSoiree(loaded);
        setLatestSession(loadedSession);
        setHasFailed(false);
      },
      (error: unknown) => {
        if (latestRequestRef.current !== requestId) return;
        setLoadError(error);
        setHasFailed(true);
      },
    );
  }, [id]);

  // Qui arrive, l'étape qui change, un vote lancé ou clôturé : tout en direct.
  useFocusEffect(
    useCallback(() => {
      loadSoiree();
      const stopSoiree = subscribeToSoiree(id, loadSoiree);
      const stopSessions = subscribeToGroupSessions(id, loadSoiree);
      return () => {
        stopSoiree();
        stopSessions();
      };
    }, [id, loadSoiree]),
  );

  function openSession(sessionId: string) {
    router.push({ pathname: "/session/[id]", params: { id: sessionId } });
  }

  async function handleShare(detail: SoireeDetail) {
    setError(null);
    setNotice(null);
    try {
      const outcome = await shareSoiree(
        detail.mode,
        detail.name,
        detail.joinToken,
        detail.inviteCode,
      );
      if (outcome === "copied") setNotice("Lien copié : colle-le dans ta conversation.");
    } catch {
      setError("Le lien n’est pas parti. Réessaie.");
    }
  }

  // C'est décidé (resto, ou menu chez quelqu'un) : le résultat part sur WhatsApp, le canal
  // des invités. Les vrais prénoms, jamais « toi » : le texte est lu par les autres.
  async function handleShareDecided(detail: SoireeDetail) {
    setError(null);
    setNotice(null);
    setIsSharingDecided(true);
    try {
      const text = decidedText({
        name: detail.name,
        dayLabel: detail.mealDate ? formatShortDay(detail.mealDate) : null,
        restaurant: detail.mode === "resto" ? (detail.restaurant ?? "") : null,
        menu: detail.menu.flatMap((vote) =>
          vote.winnerName ? [{ label: topicWords(vote.topic).label, winner: vote.winnerName }] : [],
        ),
        contributions: contributionsByPerson(detail.members, detail.contributions),
        joinUrl: soireeLink(detail.joinToken),
      });
      const outcome = await shareOrderText(text);
      if (outcome === "copied") setNotice("Copié, colle-le dans WhatsApp.");
    } catch {
      setError("Le message n’est pas parti. Réessaie.");
    } finally {
      setIsSharingDecided(false);
    }
  }

  async function handleStartVote() {
    setError(null);
    setIsStarting(true);
    try {
      openSession(await startSession(id));
    } catch (error) {
      setError(failureMessage("Le vote n’a pas démarré", error));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleChooseRestaurant() {
    const clean = restaurant.trim();
    if (clean === "") {
      setError("Écris le nom du resto.");
      return;
    }
    setError(null);
    setIsSavingRestaurant(true);
    try {
      await chooseRestaurant(id, clean);
      setIsChoosing(false);
      loadSoiree();
    } catch (error) {
      setError(failureMessage("Le resto n’est pas enregistré", error));
    } finally {
      setIsSavingRestaurant(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setIsConfirming(true);
    try {
      if (confirm.kind === "remove") {
        await removeParticipant(id, confirm.member.id);
        setConfirm({ kind: "none" });
        loadSoiree();
      } else if (confirm.kind === "leave") {
        await leaveGroup(id);
        // Un invité n'a rien d'autre dans l'app : il part avec sa session (compte effacé par
        // la purge). Un membre retourne à l'accueil.
        if (isGuest) {
          await signOut();
        } else {
          router.dismissTo("/");
        }
      } else if (confirm.kind === "delete") {
        await deleteGroup(id);
        router.dismissTo("/");
      }
    } catch (error) {
      setError(failureMessage("Ça n’a pas marché, rien n’a changé", error));
    } finally {
      setIsConfirming(false);
    }
  }

  if (hasFailed) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir le repas"
        message={`Il a peut-être été supprimé. ${loadErrorMessage(loadError)}`}
        onRetry={() => {
          setHasFailed(false);
          loadSoiree();
        }}
      />
    );
  }
  if (!soiree) {
    return <LoadingScreen />;
  }

  // Affichage seulement : le serveur refuse ces actions à tout autre compte.
  const isOwner = soiree.ownerId === userId;
  // Qui reprend l'organisation si le responsable part : la première personne arrivée après
  // lui (même règle que leave_group). Personne : la soirée est supprimée.
  const successorName = soiree.members.find((member) => member.id !== userId)?.name ?? null;
  const owner = soiree.members.find((member) => member.id === soiree.ownerId);
  const openVoteId = latestSession?.isOpen ? latestSession.id : null;

  return (
    <>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + theme.spacing.xl },
          // Sans en-tête (invité), le titre doit éviter la barre d'état.
          isGuest && { paddingTop: insets.top + theme.spacing.xl },
        ]}
        // Clavier ouvert : un toucher sur « Ajouter » ajoute du premier coup (par défaut, le
        // premier toucher ne fait que fermer le clavier). Le clavier reste ouvert pour enchaîner.
        keyboardShouldPersistTaps="handled"
      >
        {/* Un invité n'a rien derrière cet écran : pas d'en-tête, donc pas de bande vide. */}
        <Stack.Screen options={{ headerShown: !isGuest }} />
        <View style={styles.header}>
          <View style={styles.titleLine}>
            <Text style={[styles.title, styles.titleText]} accessibilityRole="header">
              {soiree.name}
            </Text>
            {!isGuest && !help.isVisible ? <HelpButton onPress={help.show} /> : null}
          </View>
          <Steps current={soiree.step} steps={stepsFor(soiree.mode)} styles={styles} />
        </View>

        {!isGuest && help.isVisible ? (
          <HelpCard
            onClose={help.dismiss}
            lines={[
              { icon: "link", text: "Le lien : on rejoint sans l’app, avec un pseudo" },
              {
                icon: "hash",
                text: `Le code ${soiree.inviteCode} : pour qui a déjà l’app`,
              },
              soiree.mode === "maison"
                ? { icon: "gift", text: "Qui apporte quoi : chacun écrit, tous voient" }
                : soiree.mode === "commande"
                  ? { icon: "list", text: "Chacun écrit sa commande, le récap suit" }
                  : { icon: "check-square", text: "Votez le resto, ou le responsable le choisit" },
            ]}
          />
        ) : null}

        {/* Seul dans sa soirée : inviter est la prochaine chose à faire. Resto décidé : le résultat
            passe avant, « Inviter quelqu'un » reste dans « Qui vient ». */}
        {soiree.members.length === 1 &&
        soiree.step !== "passee" &&
        !(soiree.mode === "resto" && soiree.step === "decide") &&
        !isGuest ? (
          <Card>
            <Text style={styles.cardTitle}>Invite tes amis</Text>
            <Text style={styles.muted}>
              Envoie le lien sur WhatsApp : pas besoin de l’app {INVITE_PURPOSE[soiree.mode]}. Ceux
              qui l’ont peuvent aussi taper le code {soiree.inviteCode}.
            </Text>
            <PrimaryButton label="Envoyer le lien" size="md" onPress={() => handleShare(soiree)} />
          </Card>
        ) : null}

        {soiree.mode === "maison" ? (
          <>
            {soiree.menu.length > 0 ? (
              <MealMenu soiree={soiree} userId={userId} onOpenVote={openSession} />
            ) : null}
            <MealContributions
              soiree={soiree}
              userId={userId}
              isOwner={isOwner}
              onChanged={loadSoiree}
            />
            {soiree.step === "decide" ? (
              <PrimaryButton
                label={soiree.menu.length > 0 ? "Partager le menu" : "Partager qui apporte quoi"}
                onPress={() => handleShareDecided(soiree)}
                isLoading={isSharingDecided}
              />
            ) : null}
          </>
        ) : soiree.mode === "resto" && soiree.step === "decide" ? (
          <>
            <SignatureCard>
              <View style={styles.decided}>
                <SignatureCat size={72} />
                <Text style={styles.decidedKicker}>C’est décidé !</Text>
                <Text style={styles.decidedTitle} accessibilityRole="header">
                  {goingTo(soiree.restaurant ?? "")}
                </Text>
                <Text style={styles.signatureMuted}>Bon appétit !</Text>
              </View>
              {latestSession && !latestSession.isOpen ? (
                <Pressable
                  onPress={() => openSession(latestSession.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.signatureLink, pressed && styles.pressed]}
                >
                  <Text style={styles.signatureLinkText}>Voir le vote</Text>
                </Pressable>
              ) : null}
            </SignatureCard>
            <PrimaryButton
              label="Partager le resto"
              onPress={() => handleShareDecided(soiree)}
              isLoading={isSharingDecided}
            />
          </>
        ) : soiree.step === "choix" ? (
          openVoteId ? (
            <Card>
              <Chip label="Vote en cours" hasDot />
              <Text style={styles.cardTitle}>Où on mange ?</Text>
              <Text style={styles.muted}>Propose un resto, coche ceux qui te tentent.</Text>
              <PrimaryButton label="Voter" size="md" onPress={() => openSession(openVoteId)} />
            </Card>
          ) : isGuest ? (
            <View style={styles.waiting}>
              <Text style={styles.waitingTitle}>
                {owner ? `${owner.name} choisit où on mange` : "On choisit où manger"}
              </Text>
              <Text style={styles.muted}>
                {soiree.mode === "commande"
                  ? "Tu pourras voter s’il lance un vote, puis écrire ta commande."
                  : "Tu pourras voter s’il lance un vote."}{" "}
                Garde cette page ouverte : elle se met à jour toute seule.
              </Text>
            </View>
          ) : (
            <SignatureCard>
              <View style={styles.signatureTop}>
                <View style={styles.signatureText}>
                  <Text style={styles.signatureTitle} accessibilityRole="header">
                    Où on mange ?
                  </Text>
                  <Text style={styles.signatureMuted}>
                    {isOwner
                      ? "Lance un vote, ou choisis toi-même si c’est déjà décidé."
                      : "Lance un vote : chacun propose et coche ses restos."}
                  </Text>
                </View>
                <SignatureCat size={56} />
              </View>
              {isChoosing ? (
                <>
                  <TextField
                    label="Le resto"
                    value={restaurant}
                    onChangeText={setRestaurant}
                    placeholder="Kebab du coin"
                    autoCapitalize="sentences"
                    maxLength={RESTAURANT_MAX_LENGTH}
                    editable={!isSavingRestaurant}
                    onSubmitEditing={handleChooseRestaurant}
                  />
                  <PrimaryButton
                    label="Choisir ce resto"
                    variant="signature"
                    size="md"
                    onPress={handleChooseRestaurant}
                    isLoading={isSavingRestaurant}
                  />
                  <TextButton label="Annuler" onPress={() => setIsChoosing(false)} />
                </>
              ) : (
                <>
                  <PrimaryButton
                    label="Lancer le vote"
                    variant="signature"
                    size="md"
                    onPress={handleStartVote}
                    isLoading={isStarting}
                  />
                  {isOwner ? (
                    <Pressable
                      onPress={() => setIsChoosing(true)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.signatureLink, pressed && styles.pressed]}
                    >
                      <Text style={styles.signatureLinkText}>Je choisis le resto</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </SignatureCard>
          )
        ) : (
          <SoireeOrder soiree={soiree} userId={userId} isOwner={isOwner} onChanged={loadSoiree} />
        )}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Qui vient · {soiree.members.length}
          </Text>
          <ListCard>
            {soiree.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isMe={member.id === userId}
                isOwnerRow={member.id === soiree.ownerId}
                // Le responsable retire quelqu'un d'autre ; personne d'autre ne peut.
                onRemove={
                  isOwner && member.id !== userId && soiree.step !== "passee"
                    ? () => setConfirm({ kind: "remove", member })
                    : undefined
                }
                styles={styles}
                mutedColor={theme.colors.textMuted}
              />
            ))}
            {soiree.step !== "passee" ? (
              <ListRow
                icon="user-plus"
                label="Inviter quelqu’un"
                subtitle={`Lien à partager, ou code ${soiree.inviteCode}`}
                onPress={() => handleShare(soiree)}
              />
            ) : null}
          </ListCard>
        </View>

        {/* Pas de notifications sur le web (invités) ; une commande passée est figée. */}
        {!isGuest && Platform.OS !== "web" && soiree.step !== "passee" ? (
          <MealNotificationsRow soireeId={soiree.id} />
        ) : null}

        {confirm.kind !== "none" ? (
          // Tout en bas et plus haute que les liens qu'elle remplace : sans défilement, elle
          // apparaît sous l'écran (et loin de la ligne touchée pour retirer quelqu'un).
          <Card onLayout={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            <Text style={styles.confirmTitle} accessibilityRole="header">
              {confirm.kind === "remove"
                ? `Retirer ${confirm.member.name} ?`
                : confirm.kind === "leave"
                  ? "Quitter le repas ?"
                  : `Supprimer « ${soiree.name} » ?`}
            </Text>
            <Text style={styles.muted}>
              {confirm.kind === "remove"
                ? `${REMOVED_WITH[soiree.mode]}${confirm.member.name} pourra revenir avec le lien.`
                : confirm.kind === "leave"
                  ? isOwner
                    ? successorName
                      ? `${successorName} prendra le relais pour organiser.`
                      : "Tu es la seule personne du repas : il disparaîtra."
                    : `${MY_REMOVED_WITH[soiree.mode]}Tu pourras revenir avec le lien.`
                  : "Il disparaît pour tout le monde. Pas de retour en arrière."}
            </Text>
            <PrimaryButton
              label={
                confirm.kind === "remove"
                  ? "Retirer"
                  : confirm.kind === "leave"
                    ? "Quitter"
                    : "Supprimer pour tout le monde"
              }
              variant="danger"
              onPress={handleConfirm}
              isLoading={isConfirming}
            />
            <TextButton
              label="Annuler"
              onPress={() => setConfirm({ kind: "none" })}
              isDisabled={isConfirming}
            />
          </Card>
        ) : (
          <View style={styles.dangerLinks}>
            <TextButton label="Quitter le repas" onPress={() => setConfirm({ kind: "leave" })} />
            {isOwner ? (
              <TextButton
                label="Supprimer le repas"
                variant="danger"
                onPress={() => setConfirm({ kind: "delete" })}
              />
            ) : null}
          </View>
        )}
      </ScrollView>
      {/* Sans en-tête (invité) : le contenu ne doit pas passer sous l'heure. */}
      {isGuest ? <StatusBarBackdrop /> : null}
    </>
  );
}

// Ce qui part avec quelqu'un qu'on retire (ou qui part) : sa commande, ce qu'il apporte.
const REMOVED_WITH: Record<SoireeMode, string> = {
  commande: "Sa commande est retirée aussi. ",
  resto: "",
  maison: "Ce qu’il apporte est retiré aussi. ",
};
const MY_REMOVED_WITH: Record<SoireeMode, string> = {
  commande: "Ta commande est retirée. ",
  resto: "",
  maison: "Ce que tu apportes est retiré. ",
};

function Steps({
  current,
  steps,
  styles,
}: {
  current: SoireeStep;
  steps: { step: SoireeStep; label: string }[];
  styles: Styles;
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((item) => item.step === current),
  );
  return (
    <View
      style={styles.steps}
      accessibilityLabel={`Étape ${currentIndex + 1} sur ${steps.length} : ${steps[currentIndex].label}`}
    >
      {steps.map((item, index) => (
        <View key={item.step} style={styles.stepItem}>
          {index > 0 ? (
            <View style={[styles.stepBar, index <= currentIndex && styles.stepBarDone]} />
          ) : null}
          <Text style={[styles.stepLabel, index === currentIndex && styles.stepLabelCurrent]}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MemberRow({
  member,
  isMe,
  isOwnerRow,
  onRemove,
  styles,
  mutedColor,
}: {
  member: SoireeMember;
  isMe: boolean;
  isOwnerRow: boolean;
  onRemove?: () => void;
  styles: Styles;
  mutedColor: string;
}) {
  const details = [isMe ? "toi" : null, isOwnerRow ? "responsable" : null]
    .filter(Boolean)
    .join(", ");
  const content = (
    <>
      <Avatar name={member.name} avatar={member.avatar} photoPath={member.photoPath} size={40} />
      <View style={styles.memberText}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.name}
          {details ? <Text style={styles.muted}> · {details}</Text> : null}
        </Text>
      </View>
      {member.isGuest ? <Chip label="invité" style={styles.guestChip} /> : null}
      {onRemove ? <Feather name="more-horizontal" size={20} color={mutedColor} /> : null}
    </>
  );

  return onRemove ? (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`${member.name}${member.isGuest ? ", invité" : ""} : retirer du repas`}
      style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      style={styles.memberRow}
      accessible
      accessibilityLabel={`${member.name}${member.isGuest ? ", invité" : ""}${details ? `, ${details}` : ""}`}
    >
      {content}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
    pressed: { opacity: 0.6 },
    header: { gap: spacing.md },
    titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    titleText: { flexShrink: 1 },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    steps: { flexDirection: "row", alignItems: "center" },
    stepItem: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
    stepBar: {
      width: 22,
      height: 3,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginHorizontal: spacing.sm,
    },
    stepBarDone: { backgroundColor: colors.brand },
    stepLabel: { color: colors.textMuted, fontSize: fontSize.small },
    stepLabelCurrent: { color: colors.text, fontWeight: "700" },
    cardTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    signatureTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    signatureText: { flex: 1, gap: spacing.xs },
    signatureTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    signatureMuted: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    // 48 de haut, comme TextButton : la taille minimale d'une zone de toucher sur Android.
    signatureLink: {
      alignSelf: "center",
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    signatureLinkText: {
      color: colors.onSignature,
      fontSize: fontSize.body,
      textDecorationLine: "underline",
    },
    // Resto choisi (repas « resto ») : le moment fort, centré.
    decided: { alignItems: "center", gap: spacing.sm },
    decidedKicker: { color: colors.onSignatureMuted, fontSize: fontSize.small, fontWeight: "700" },
    decidedTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
      textAlign: "center",
    },
    // Carte d'attente en pointillés, comme « On attend Camille » sur le vote.
    waiting: {
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: 22,
      padding: spacing.lg,
      gap: spacing.xs,
      alignItems: "center",
    },
    waitingTitle: {
      color: colors.text,
      fontSize: fontSize.body,
      fontWeight: "700",
      textAlign: "center",
    },
    section: { gap: spacing.md },
    sectionTitle: {
      paddingHorizontal: spacing.xs,
      color: colors.textMuted,
      fontSize: fontSize.small,
      fontWeight: "700",
    },
    memberRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    memberText: { flex: 1, minWidth: 0 },
    guestChip: { alignSelf: "center" },
    memberName: { color: colors.text, fontSize: fontSize.body },
    error: { color: colors.danger, fontSize: fontSize.small },
    notice: { color: colors.success, fontSize: fontSize.small },
    confirmTitle: {
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.cardTitle,
    },
    dangerLinks: {
      marginTop: "auto",
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.xl,
    },
  });
}
