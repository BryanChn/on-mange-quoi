import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { AvatarPicker } from "@/components/avatar-picker";
import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
import { StatusBarBackdrop } from "@/components/status-bar-backdrop";
import { LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import type { AvatarId } from "@/lib/avatar";
import { openPrivacyPolicy } from "@/lib/privacy";
import { DISPLAY_NAME_MAX_LENGTH, useProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import {
  JOIN_FAILURE_MESSAGES,
  SOIREE_MAX_MEMBERS,
  toJoinFailure,
  type JoinFailure,
} from "@/lib/soiree-rules";
import { fetchSoireePreview, joinSoiree, type SoireePreview } from "@/lib/soirees";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

type Styles = ReturnType<typeof createStyles>;

// Lien partagé d'une soirée : on-mange-quoi.expo.app/rejoindre/<jeton>, ou dans l'app. Ouvert à
// tous : sans compte, on rejoint avec un pseudo (connexion anonyme) ; avec un compte, en un
// toucher. Le layout ne démonte pas cet écran pendant l'arrivée (voir isJoinRoute).
export default function JoinSoireeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useSession();
  const { profile, reload } = useProfile();
  // undefined : en chargement ; null : aucun lien ne correspond.
  const [preview, setPreview] = useState<SoireePreview | null | undefined>(undefined);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Une fois, puis à chaque nouvel essai. Pas à chaque changement de session : la connexion
  // anonyme d'un invité en pleine arrivée relancerait l'aperçu pour rien.
  useEffect(() => {
    let isStale = false;
    fetchSoireePreview(token).then(
      (loaded) => {
        if (isStale) return;
        setPreview(loaded);
        setHasFailed(false);
      },
      (error: unknown) => {
        if (!isStale) {
          setLoadError(error);
          setHasFailed(true);
        }
      },
    );
    return () => {
      isStale = true;
    };
  }, [token, attempt]);

  // Déjà dans la soirée (lien rouvert) : directement à la soirée.
  const alreadyMember = preview?.isMember === true;
  useEffect(() => {
    if (alreadyMember && preview) {
      router.replace({ pathname: "/soiree/[id]", params: { id: preview.id } });
    }
  }, [alreadyMember, preview]);

  // Un compte avec profil (membre, ou invité d'une autre soirée) garde son nom.
  const joinsWithProfile = session !== null && profile !== null;

  async function handleJoin() {
    const cleanName = name.trim();
    if (!joinsWithProfile && cleanName === "") {
      setError("Choisis un pseudo : c’est le nom que les autres verront.");
      return;
    }
    setError(null);
    setFailure(null);
    setIsJoining(true);

    try {
      const soireeId = await joinSoiree(
        token,
        joinsWithProfile ? undefined : { name: cleanName, avatar },
      );
      // Le profil d'un invité vient d'être créé sur le serveur : l'app doit le connaître avant
      // d'ouvrir la soirée (écran réservé aux comptes avec profil).
      await reload();
      router.replace({ pathname: "/soiree/[id]", params: { id: soireeId } });
    } catch (joinError) {
      const known = toJoinFailure(joinError);
      if (known === "name_required") {
        setError(JOIN_FAILURE_MESSAGES.name_required.message);
      } else if (known) {
        setFailure(known);
      } else {
        setError(failureMessage("Tu n’as pas pu rejoindre", joinError));
      }
      setIsJoining(false);
    }
  }

  if (hasFailed) {
    return (
      <Centered styles={styles} insetsBottom={insets.bottom}>
        <Card>
          <Text style={styles.cardTitle}>On n’arrive pas à ouvrir le repas</Text>
          <Text style={styles.muted}>{loadErrorMessage(loadError)}</Text>
          <PrimaryButton label="Réessayer" onPress={() => setAttempt((count) => count + 1)} />
        </Card>
      </Centered>
    );
  }
  if (preview === undefined || alreadyMember) {
    return <LoadingScreen />;
  }

  // Refus connus avant même d'essayer : lien inconnu, commande passée, soirée complète.
  const blocking: JoinFailure | null =
    failure ??
    (preview === null
      ? "invalid_link"
      : preview.step === "passee"
        ? "soiree_closed"
        : preview.memberCount >= SOIREE_MAX_MEMBERS
          ? "soiree_full"
          : null);

  if (blocking || !preview) {
    const { title, message } = JOIN_FAILURE_MESSAGES[blocking ?? "invalid_link"];
    return (
      <Centered styles={styles} insetsBottom={insets.bottom}>
        <Card>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.muted}>{message}</Text>
        </Card>
      </Centered>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SignatureCard style={styles.invitation}>
          <SignatureCat size={64} />
          <Text style={styles.signatureMuted}>{preview.ownerName} t’invite à</Text>
          <Text style={styles.signatureTitle} accessibilityRole="header">
            {preview.name}
          </Text>
          <View style={styles.avatars}>
            {preview.members.map((member, index) => (
              <Avatar key={index} name={member.name} avatar={member.avatar} size={30} />
            ))}
            {preview.memberCount > preview.members.length ? (
              <Text style={styles.signatureMuted}>
                +{preview.memberCount - preview.members.length}
              </Text>
            ) : null}
          </View>
        </SignatureCard>

        {joinsWithProfile ? (
          <View style={styles.me}>
            <Avatar
              name={profile.display_name}
              avatar={profile.avatar}
              photoPath={profile.photo_path}
              size={44}
            />
            <Text style={styles.meText}>Tu rejoins en tant que {profile.display_name}</Text>
          </View>
        ) : (
          <>
            <TextField
              label="Ton prénom ou pseudo"
              value={name}
              onChangeText={setName}
              placeholder="Tom"
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              editable={!isJoining}
              onSubmitEditing={handleJoin}
            />
            <View style={styles.pickerBlock}>
              <Text style={styles.label}>
                Ton avatar <Text style={styles.muted}>(facultatif)</Text>
              </Text>
              <AvatarPicker
                name={name.trim() || "?"}
                selected={avatar}
                onSelect={setAvatar}
                isDisabled={isJoining}
              />
            </View>
          </>
        )}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        <PrimaryButton label="Rejoindre le repas" onPress={handleJoin} isLoading={isJoining} />
        {joinsWithProfile ? null : (
          <View style={styles.privacy}>
            <Text style={styles.hint}>
              Pas de compte : ton pseudo est effacé 24 h après la commande.
            </Text>
            <TextButton label="Confidentialité" onPress={openPrivacyPolicy} />
          </View>
        )}
      </ScrollView>
      <StatusBarBackdrop />
    </KeyboardAvoidingView>
  );
}

function Centered({
  children,
  styles,
  insetsBottom,
}: {
  children: React.ReactNode;
  styles: Styles;
  insetsBottom: number;
}) {
  return (
    <View style={[styles.screen, styles.centered, { paddingBottom: insetsBottom }]}>
      {children}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { justifyContent: "center", padding: spacing.xl },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl,
      gap: spacing.xl,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },
    invitation: { alignItems: "center", gap: spacing.sm },
    signatureTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
      textAlign: "center",
    },
    signatureMuted: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    avatars: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    cardTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.cardTitle },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    label: { color: colors.text, fontSize: fontSize.small, fontWeight: "700" },
    pickerBlock: { gap: spacing.sm },
    me: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
    meText: { color: colors.text, fontSize: fontSize.body, fontWeight: "700", flexShrink: 1 },
    error: { color: colors.danger, fontSize: fontSize.small },
    privacy: { alignItems: "center", gap: spacing.xs },
    hint: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
  });
}
