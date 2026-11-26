import { useHeaderHeight } from "expo-router/react-navigation";
import { useUpdates } from "expo-updates";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { AvatarPicker } from "@/components/avatar-picker";
import { Card } from "@/components/card";
import { ListCard, ListRow } from "@/components/list";
import { NotificationSettingsCard } from "@/components/notification-settings-card";
import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { deleteAccount, fetchDeletionImpact, type DeletionImpact } from "@/lib/account";
import { versionLabel } from "@/lib/app-version";
import type { AvatarId } from "@/lib/avatar";
import { signOut } from "@/lib/notifications";
import { openPrivacyPolicy } from "@/lib/privacy";
import { DISPLAY_NAME_MAX_LENGTH, useProfile } from "@/lib/profile";
import { pickProfilePhoto, type PhotoSource } from "@/lib/photo-picker";
import { canCheckForUpdates, fetchLatestUpdate, restartOnLatestUpdate } from "@/lib/updates";
import { useTheme, type Theme } from "@/theme";

// idle → loading (calcul des conséquences) → confirm → deleting. Une suppression réussie
// déconnecte : le layout renvoie alors à l'écran de connexion, cet écran disparaît.
type DeleteStep = "idle" | "loading" | "confirm" | "deleting";

type UpdateCheck = "idle" | "checking" | "upToDate" | "restarting" | "failed";

const UPDATE_CHECK_LABELS: Record<UpdateCheck, string> = {
  idle: "Vérifier les mises à jour",
  checking: "Recherche d’une mise à jour…",
  upToDate: "Tu as la dernière version",
  restarting: "Redémarrage sur la nouvelle version…",
  failed: "La vérification n’a pas marché : réessaie",
};

export default function AccountScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { profile, saveDisplayName, saveAvatar, savePhoto } = useProfile();
  const displayName = profile?.display_name ?? "";

  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [step, setStep] = useState<DeleteStep>("idle");
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Appareil photo refusé : on propose d'ouvrir les réglages du téléphone.
  const [isCameraDenied, setIsCameraDenied] = useState(false);
  const { currentlyRunning } = useUpdates();
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck>("idle");

  async function handleSelectAvatar(avatar: AvatarId | null) {
    setAvatarError(null);
    setIsSavingAvatar(true);
    try {
      await saveAvatar(avatar);
    } catch {
      setAvatarError("Ton avatar n’est pas enregistré : vérifie ta connexion et réessaie.");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  // Comme dans les autres apps : prendre une photo, ou en choisir une dans la galerie.
  async function handlePickPhoto(source: PhotoSource) {
    setAvatarError(null);
    setIsCameraDenied(false);
    setIsSavingAvatar(true);
    try {
      const picked = await pickProfilePhoto(source);
      if (picked.kind === "denied") {
        setIsCameraDenied(true);
      } else if (picked.kind === "picked") {
        await savePhoto(picked.bytes);
      }
    } catch {
      setAvatarError("Ta photo n’est pas enregistrée : vérifie ta connexion et réessaie.");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handleRemovePhoto() {
    setAvatarError(null);
    setIsSavingAvatar(true);
    try {
      await savePhoto(null);
    } catch {
      setAvatarError("Ta photo n’a pas été retirée : vérifie ta connexion et réessaie.");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  function handleStartRename() {
    setNameDraft(displayName);
    setNameError(null);
    setIsRenaming(true);
  }

  async function handleSaveName() {
    const cleanName = nameDraft.trim();
    if (cleanName === "") {
      setNameError("Écris le prénom que les autres verront.");
      return;
    }
    // Rien à enregistrer : on referme sans appeler le serveur.
    if (cleanName === displayName) {
      setIsRenaming(false);
      return;
    }
    setNameError(null);
    setIsSavingName(true);

    try {
      await saveDisplayName(cleanName);
      setIsRenaming(false);
    } catch {
      setNameError("Ton prénom n’est pas enregistré : vérifie ta connexion et réessaie.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleAskDelete() {
    setError(null);
    setStep("loading");

    try {
      setImpact(await fetchDeletionImpact());
      setStep("confirm");
    } catch {
      setStep("idle");
      setError("On n’arrive pas à préparer la suppression : vérifie ta connexion et réessaie.");
    }
  }

  async function handleDelete() {
    setError(null);
    setStep("deleting");

    try {
      await deleteAccount();
    } catch {
      // Rien n'a été supprimé : delete_account est une seule transaction.
      setStep("confirm");
      setError("Ton compte n’a pas été supprimé : vérifie ta connexion et réessaie.");
    }
  }

  function handleCancel() {
    setStep("idle");
    setImpact(null);
    setError(null);
  }

  const isConfirming = (step === "confirm" || step === "deleting") && impact !== null;

  // Vérification à la demande : sur cet écran, redémarrer ne fait rien perdre, la nouvelle
  // version s'applique donc tout de suite.
  async function handleCheckUpdate() {
    setUpdateCheck("checking");
    try {
      const result = await fetchLatestUpdate();
      if (result === "upToDate") {
        setUpdateCheck("upToDate");
        return;
      }
      setUpdateCheck("restarting");
      await restartOnLatestUpdate();
    } catch {
      setUpdateCheck("failed");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.identity}>
          <Avatar
            name={displayName}
            avatar={profile?.avatar}
            photoPath={profile?.photo_path}
            size={72}
          />
          <Text style={styles.title} accessibilityRole="header">
            {displayName}
          </Text>
        </View>

        {isRenaming ? (
          <Card>
            <TextField
              label="Ton nom"
              value={nameDraft}
              onChangeText={setNameDraft}
              error={nameError}
              placeholder="Camille"
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              autoFocus
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              editable={!isSavingName}
              onSubmitEditing={handleSaveName}
            />
            <PrimaryButton label="Enregistrer" onPress={handleSaveName} isLoading={isSavingName} />
            <TextButton
              label="Annuler"
              onPress={() => setIsRenaming(false)}
              isDisabled={isSavingName}
            />
          </Card>
        ) : null}

        {!isRenaming && !isConfirming ? (
          <>
            <ListCard>
              {/* Pas d'appareil photo sur la version web. */}
              {Platform.OS !== "web" ? (
                <ListRow
                  icon="camera"
                  label="Prendre une photo"
                  onPress={() => handlePickPhoto("camera")}
                  isDisabled={isSavingAvatar}
                />
              ) : null}
              <ListRow
                icon="image"
                label="Choisir dans la galerie"
                onPress={() => handlePickPhoto("library")}
                isDisabled={isSavingAvatar}
              />
              {profile?.photo_path ? (
                <ListRow
                  icon="x-circle"
                  label="Retirer la photo"
                  onPress={handleRemovePhoto}
                  isDisabled={isSavingAvatar}
                />
              ) : null}
            </ListCard>
            {isCameraDenied ? (
              <Card>
                <Text style={styles.text}>
                  L’appareil photo est bloqué pour l’app. Autorise-le dans les réglages du
                  téléphone, ou choisis une photo dans la galerie.
                </Text>
                <TextButton label="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
              </Card>
            ) : null}
            <Card>
              <Text style={styles.confirmTitle}>Ou un avatar</Text>
              <AvatarPicker
                name={displayName}
                selected={profile?.avatar ?? null}
                onSelect={handleSelectAvatar}
                isDisabled={isSavingAvatar}
              />
              {avatarError ? (
                <Text
                  style={styles.error}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {avatarError}
                </Text>
              ) : (
                <Text style={styles.hint}>
                  {profile?.photo_path
                    ? "Ta photo s’affiche partout. Choisir un avatar la remplace."
                    : "Le même partout, en clair comme en sombre."}
                </Text>
              )}
            </Card>
            {/* Pas de notifications sur la version web. */}
            {Platform.OS !== "web" ? <NotificationSettingsCard /> : null}
            <ListCard>
              <ListRow icon="edit-2" label="Changer mon nom" onPress={handleStartRename} />
              <ListRow icon="log-out" label="Se déconnecter" onPress={signOut} />
            </ListCard>
            <ListCard>
              <ListRow
                icon="smartphone"
                label={UPDATE_CHECK_LABELS[updateCheck]}
                subtitle={versionLabel(currentlyRunning)}
                onPress={handleCheckUpdate}
                isDisabled={
                  !canCheckForUpdates || updateCheck === "checking" || updateCheck === "restarting"
                }
              />
              <ListRow
                icon="shield"
                label="Confidentialité"
                subtitle="Tes données et tes droits"
                onPress={openPrivacyPolicy}
                accessibilityLabel="Politique de confidentialité, s’ouvre dans le navigateur"
              />
            </ListCard>
            <ListCard>
              <ListRow
                icon="trash-2"
                label={step === "loading" ? "Chargement…" : "Supprimer mon compte"}
                subtitle="Ton compte, ton nom et tes votes sont effacés"
                variant="danger"
                onPress={handleAskDelete}
                isDisabled={step === "loading"}
              />
            </ListCard>
          </>
        ) : null}

        {isConfirming ? (
          <Card>
            <Text style={styles.confirmTitle} accessibilityRole="header">
              Supprimer ton compte ?
            </Text>
            <Text style={styles.text}>Avant de confirmer, voici ce qui va se passer :</Text>
            <View style={styles.list}>
              {impact.ownedGroups.map((group) => (
                <Text key={group.groupId} style={styles.text}>
                  •{" "}
                  {group.successorName
                    ? `« ${group.groupName} » : ${group.successorName} prend le relais pour organiser.`
                    : `« ${group.groupName} » disparaît avec ses votes (tu en es la seule personne).`}
                </Text>
              ))}
              {impact.openSessionCount > 0 ? (
                <Text style={styles.text}>
                  •{" "}
                  {impact.openSessionCount === 1
                    ? "Le vote que tu as lancé reste ouvert : la personne qui organise le groupe pourra le terminer."
                    : `Les ${impact.openSessionCount} votes que tu as lancés restent ouverts : les personnes qui organisent les groupes pourront les terminer.`}
                </Text>
              ) : null}
              <Text style={styles.text}>
                • Tu quittes tous tes groupes, et tes votes sont effacés.
              </Text>
              <Text style={styles.text}>• Les plats que tu as proposés restent, sans ton nom.</Text>
            </View>
            <Text style={styles.warning}>Pas de retour en arrière possible.</Text>
            <PrimaryButton
              label="Supprimer mon compte"
              onPress={handleDelete}
              isLoading={step === "deleting"}
              variant="danger"
            />
            <TextButton label="Annuler" onPress={handleCancel} isDisabled={step === "deleting"} />
          </Card>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: { padding: spacing.xl, gap: spacing.xl },
    identity: { alignItems: "center", gap: spacing.md },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 36,
      textAlign: "center",
    },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
    text: { color: colors.text, fontSize: fontSize.small, lineHeight: 22 },
    list: { gap: spacing.sm },
    warning: { color: colors.danger, fontSize: fontSize.small, fontWeight: "600" },
    error: { color: colors.danger, fontSize: fontSize.small },
    hint: { color: colors.textMuted, fontSize: fontSize.caption },
  });
}
