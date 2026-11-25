// Réglages des notifications (migration notification_settings) : deux interrupteurs dans
// Mon compte. Pas de ligne en base = tout est activé ; la ligne n'est créée qu'au premier
// interrupteur touché. Le serveur (notify-vote) lit ces réglages avant d'envoyer.
import { getUserId, supabase } from "./supabase";

// votes : les votes d'un foyer. meals : tout ce qui concerne un repas à plusieurs.
export type NotificationCategory = "votes" | "meals";

export type NotificationSettings = Record<NotificationCategory, boolean>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { votes: true, meals: true };

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("votes, meals")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_NOTIFICATION_SETTINGS;
}

// Un seul interrupteur à la fois : à la création, l'autre garde sa valeur par défaut (activé) ;
// ensuite, seule la colonne envoyée change.
export async function saveNotificationSetting(
  category: NotificationCategory,
  isOn: boolean,
): Promise<void> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("notification_settings")
    .upsert(
      category === "votes"
        ? { profile_id: userId, votes: isOn }
        : { profile_id: userId, meals: isOn },
    )
    .select("profile_id");
  if (error) throw error;
  // La RLS peut refuser sans erreur (0 ligne) : pas de faux succès.
  if (!data || data.length === 0) throw new Error("notification_settings_not_saved");
}
