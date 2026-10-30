import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

import type { Tables } from "./database.types";
import { useSession } from "./session";
import { supabase } from "./supabase";

type Profile = Pick<Tables<"profiles">, "id" | "display_name">;

// Le résultat d'un chargement, rattaché à son compte : `profile: null` veut dire
// « ce compte n'a pas de profil », à ne pas confondre avec un chargement raté.
type LoadedProfile = {
  userId: string;
  profile: Profile | null;
  hasFailed: boolean;
};

type ProfileState = {
  profile: Profile | null;
  isLoading: boolean;
  hasFailed: boolean;
  retry: () => void;
  createProfile: (displayName: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
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

    fetchProfile(userId).then(
      (profile) => {
        if (!isStale) setLoaded({ userId, profile, hasFailed: false });
      },
      () => {
        if (!isStale) setLoaded({ userId, profile: null, hasFailed: true });
      },
    );

    return () => {
      isStale = true;
    };
  }, [userId, attempt]);

  // Un résultat chargé pour un autre compte ne vaut rien pour celui-ci.
  const current = loaded?.userId === userId ? loaded : null;

  function retry() {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }

  async function createProfile(displayName: string) {
    if (!userId) throw new Error("Aucun compte connecté.");

    // upsert et non insert : un second envoi ne plante pas sur la clé primaire.
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: displayName })
      .select("id, display_name")
      .single();

    if (error) throw error;
    setLoaded({ userId, profile: data, hasFailed: false });
  }

  const value: ProfileState = {
    profile: current?.profile ?? null,
    isLoading: userId !== null && current === null,
    hasFailed: current?.hasFailed ?? false,
    retry,
    createProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile doit être utilisé dans un ProfileProvider.");
  return value;
}
