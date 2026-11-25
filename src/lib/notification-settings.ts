// Réglages des notifications (migration notification_settings) : deux interrupteurs dans
// Mon compte. Pas de ligne en base = tout est activé ; la ligne n'est créée qu'au premier
// interrupteur touché. Le serveur (notify-vote) lit ces réglages avant d'envoyer.
import { getUserId, supabase } from "./supabase";

// votes : les votes d'un foyer. meals : tout ce qui concerne un repas à plusieurs.
// shopping : « Je pars faire les courses » et ce que le foyer ajoute pendant ce temps.
export type NotificationCategory = "votes" | "meals" | "shopping";

export type NotificationSettings = Record<NotificationCategory, boolean>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  votes: true,
  meals: true,
  shopping: true,
};

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("votes, meals, shopping")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_NOTIFICATION_SETTINGS;
}

// La colonne de l'interrupteur touché, et elle seule.
type SettingsRow = { profile_id: string } & Partial<NotificationSettings>;

function rowFor(userId: string, category: NotificationCategory, isOn: boolean): SettingsRow {
  if (category === "votes") return { profile_id: userId, votes: isOn };
  if (category === "meals") return { profile_id: userId, meals: isOn };
  return { profile_id: userId, shopping: isOn };
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
    .upsert(rowFor(userId, category, isOn))
    .select("profile_id");
  if (error) throw error;
  // La RLS peut refuser sans erreur (0 ligne) : pas de faux succès.
  if (!data || data.length === 0) throw new Error("notification_settings_not_saved");
}

// Un seul repas (migration meal_notification_mutes) : une ligne = ce repas est coupé pour
// moi. Pas de ligne = activé.
export async function fetchMealNotificationsOn(soireeId: string): Promise<boolean> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("meal_notification_mutes")
    .select("group_id")
    .eq("group_id", soireeId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data === null;
}

export async function setMealNotificationsOn(soireeId: string, isOn: boolean): Promise<void> {
  const userId = await getUserId();
  if (isOn) {
    // Retirer une ligne absente n'est pas une erreur : l'état voulu est atteint.
    const { error } = await supabase
      .from("meal_notification_mutes")
      .delete()
      .eq("group_id", soireeId)
      .eq("profile_id", userId);
    if (error) throw error;
    return;
  }
  // Déjà coupé (deux touchers, deux téléphones) : même état, pas une erreur.
  const { error } = await supabase
    .from("meal_notification_mutes")
    .upsert({ group_id: soireeId, profile_id: userId }, { ignoreDuplicates: true });
  if (error) throw error;
}
