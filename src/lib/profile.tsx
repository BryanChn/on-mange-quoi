import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";

import { updateMyAvatar } from "./account";
import { removeProfilePhoto, uploadProfilePhoto } from "./photo-storage";
import type { AvatarId } from "./avatar";
import type { Tables } from "./database.types";
import { classifyError, withRetry, type ErrorKind } from "./network-errors";
import { useSession } from "./session";
import { supabase } from "./supabase";

type Profile = Pick<Tables<"profiles">, "id" | "display_name" | "avatar" | "photo_path">;

const PROFILE_COLUMNS = "id, display_name, avatar, photo_path";

// Même limite que la colonne profiles.display_name.
export const DISPLAY_NAME_MAX_LENGTH = 30;

// Le résultat d'un chargement, rattaché à son compte : `profile: null` veut dire
// « ce compte n'a pas de profil », à ne pas confondre avec un chargement raté (errorKind).
type LoadedProfile = {
  userId: string;
  profile: Profile | null;
  errorKind: ErrorKind | null;
};

type ProfileState = {
  profile: Profile | null;
  isLoading: boolean;
  hasFailed: boolean;
  // Pourquoi le chargement a échoué : l'écran d'erreur dit la vraie cause.
  errorKind: ErrorKind | null;
  retry: () => void;
  // Relit le profil sans repasser par l'état « chargement » : après join_soiree, qui crée
  // le profil d'un invité sur le serveur.
  reload: () => Promise<void>;
  // Crée le profil à la première connexion, ou change le nom ensuite.
  saveDisplayName: (displayName: string) => Promise<void>;
  // Avatar prédéfini, ou null pour revenir à l'initiale. Retire la photo perso s'il y en a une.
  saveAvatar: (avatar: AvatarId | null) => Promise<void>;
  // Photo perso (JPEG déjà réduit), ou null pour la retirer.
  savePhoto: (bytes: Uint8Array | null) => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;

    // Si le compte change pendant l'appel, sa réponse arrive trop tard : on l'ignore.
    let isStale = false;

    // Une coupure courte au démarrage (5G → Wi-Fi) est réessayée en silence : 1 s, 2 s, 4 s.
    withRetry(() => fetchProfile(userId)).then(
      (profile) => {
        if (!isStale) setLoaded({ userId, profile, errorKind: null });
      },
      (error: unknown) => {
        if (!isStale) setLoaded({ userId, profile: null, errorKind: classifyError(error) });
      },
    );

    return () => {
      isStale = true;
    };
  }, [userId, attempt]);

  // Un résultat chargé pour un autre compte ne vaut rien pour celui-ci.
  const current = loaded?.userId === userId ? loaded : null;
  const hasFailed = current?.errorKind != null;

  // En échec, on réessaie quand l'app revient au premier plan (le réseau est souvent revenu
  // entre-temps) : l'état de l'app est un système extérieur à React, d'où l'abonnement.
  useEffect(() => {
    if (!hasFailed) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setLoaded(null);
      setAttempt((count) => count + 1);
    });
    return () => subscription.remove();
  }, [hasFailed]);

  function retry() {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }

  // Lit le compte dans la session plutôt que userId : appelée juste après une connexion
  // anonyme, depuis une fonction créée avant elle, userId y vaudrait encore null.
  async function reload() {
    const { data } = await supabase.auth.getSession();
    const currentUserId = data.session?.user.id;
    if (!currentUserId) throw new Error("Aucun compte connecté.");
    const profile = await fetchProfile(currentUserId);
    setLoaded({ userId: currentUserId, profile, errorKind: null });
  }

  async function saveDisplayName(displayName: string) {
    if (!userId) throw new Error("Aucun compte connecté.");

    // upsert : crée la ligne si elle n'existe pas, la met à jour sinon. Un second envoi
    // ne plante donc pas sur la clé primaire, et la même fonction sert à changer de nom.
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: displayName })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw error;
    setLoaded({ userId, profile: data, errorKind: null });
  }

  async function saveAvatar(avatar: AvatarId | null) {
    if (!userId || !current?.profile) throw new Error("Aucun profil chargé.");
    // Choisir un dessin, c'est renoncer à la photo : sinon elle continuerait de s'afficher.
    if (current.profile.photo_path) await removeProfilePhoto(current.profile.photo_path);
    await updateMyAvatar(avatar);
    const updated = { ...current.profile, avatar, photo_path: null };
    setLoaded({ userId, profile: updated, errorKind: null });
  }

  async function savePhoto(bytes: Uint8Array | null) {
    if (!userId || !current?.profile) throw new Error("Aucun profil chargé.");
    const previous = current.profile.photo_path;
    let photo_path: string | null = null;
    if (bytes) {
      photo_path = await uploadProfilePhoto(bytes, previous);
    } else if (previous) {
      await removeProfilePhoto(previous);
    }
    setLoaded({ userId, profile: { ...current.profile, photo_path }, errorKind: null });
  }

  const value: ProfileState = {
    profile: current?.profile ?? null,
    isLoading: userId !== null && current === null,
    hasFailed,
    errorKind: current?.errorKind ?? null,
    retry,
    reload,
    saveDisplayName,
    saveAvatar,
    savePhoto,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile doit être utilisé dans un ProfileProvider.");
  return value;
}
