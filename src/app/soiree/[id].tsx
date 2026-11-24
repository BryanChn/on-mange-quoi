import { Feather } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
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
import { ListCard, ListRow } from "@/components/list";
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
import { shareSoiree } from "@/lib/share-soiree";
import { useSession } from "@/lib/session";
import {
  chooseRestaurant,
  fetchSoiree,
  removeParticipant,
  subscribeToSoiree,
  type SoireeDetail,
  type SoireeMember,
  type SoireeStep,
} from "@/lib/soirees";
import {
  fetchLatestSession,
  startSession,
  subscribeToGroupSessions,
  type LatestSession,
} from "@/lib/votes";
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

const STEPS: { step: SoireeStep; label: string }[] = [
  { step: "choix", label: "Où on mange" },
  { step: "commande", label: "Commande" },
  { step: "passee", label: "Passée" },
];

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);
  const [restaurant, setRestaurant] = useState("");
  const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>({ kind: "none" });
  const [isConfirming, setIsConfirming] = useState(false);

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);
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
      () => {
        if (latestRequestRef.current !== requestId) return;
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
      const outcome = await shareSoiree(detail.name, detail.joinToken, detail.inviteCode);
      if (outcome === "copied") setNotice("Lien copié : colle-le dans ta conversation.");
    } catch {
      setError("Le lien n’est pas parti. Réessaie.");
    }
  }

  async function handleStartVote() {
    setError(null);
    setIsStarting(true);
    try {
      openSession(await startSession(id));
    } catch {
      setError("Le vote n’a pas démarré : vérifie ta connexion et réessaie.");
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
    } catch {
      setError("Le resto n’est pas enregistré : vérifie ta connexion et réessaie.");
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
    } catch {
      setError("Ça n’a pas marché, rien n’a changé. Vérifie ta connexion et réessaie.");
    } finally {
      setIsConfirming(false);
    }
  }

  if (hasFailed) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir le repas"
        message="Il a peut-être été supprimé. Sinon, vérifie ta connexion."
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
          <Text style={styles.title} accessibilityRole="header">
            {soiree.name}
          </Text>
          <Steps current={soiree.step} styles={styles} />
        </View>

        {/* Seul dans sa soirée : inviter est la prochaine chose à faire. */}
        {soiree.members.length === 1 && soiree.step !== "passee" && !isGuest ? (
          <Card>
            <Text style={styles.cardTitle}>Invite tes amis</Text>
            <Text style={styles.muted}>
              Envoie le lien sur WhatsApp : pas besoin de l’app pour commander. Ceux qui l’ont
              peuvent aussi taper le code {soiree.inviteCode}.
            </Text>
            <PrimaryButton label="Envoyer le lien" onPress={() => handleShare(soiree)} />
          </Card>
        ) : null}

        {soiree.step === "choix" ? (
          openVoteId ? (
            <Card>
              <Chip label="Vote en cours" hasDot />
              <Text style={styles.cardTitle}>Où on mange ?</Text>
              <Text style={styles.muted}>Propose un resto, coche ceux qui te tentent.</Text>
              <PrimaryButton label="Voter" onPress={() => openSession(openVoteId)} />
            </Card>
          ) : isGuest ? (
            <View style={styles.waiting}>
              <Text style={styles.waitingTitle}>
                {owner ? `${owner.name} choisit où on mange` : "On choisit où manger"}
              </Text>
              <Text style={styles.muted}>
                Tu pourras voter s’il lance un vote, puis écrire ta commande. Garde cette page
                ouverte : elle se met à jour toute seule.
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
                ? `Sa commande est retirée aussi. ${confirm.member.name} pourra revenir avec le lien.`
                : confirm.kind === "leave"
                  ? isOwner
                    ? successorName
                      ? `${successorName} prendra le relais pour organiser.`
                      : "Tu es la seule personne du repas : il disparaîtra."
                    : "Ta commande est retirée. Tu pourras revenir avec le lien."
                  : "Il disparaît pour tout le monde, commandes comprises. Pas de retour en arrière."}
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

function Steps({ current, styles }: { current: SoireeStep; styles: Styles }) {
  const currentIndex = STEPS.findIndex((item) => item.step === current);
  return (
    <View
      style={styles.steps}
      accessibilityLabel={`Étape ${currentIndex + 1} sur 3 : ${STEPS[currentIndex].label}`}
    >
      {STEPS.map((item, index) => (
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
    container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
    pressed: { opacity: 0.6 },
    header: { gap: spacing.md },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
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
    sectionTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
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
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    dangerLinks: {
      marginTop: "auto",
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.xl,
    },
  });
}
