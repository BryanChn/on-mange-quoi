// Version web de notifications.ts : Metro prend ce fichier pour le navigateur (extension
// .web.ts). Pas de notification push sur la page web (invités des soirées) : expo-notifications
// n'est jamais importé, sinon l'app plante au démarrage (getLastNotificationResponse n'existe
// pas sur le web et un hook ne s'appelle pas sous condition).
//
// Mêmes exports que la version native, typés par elle : si l'une change, TypeScript signale
// l'autre.
import type * as Native from "./notifications";
import { clearPhotoUrlCache } from "./photo-storage";
import { supabase } from "./supabase";

export type RedirectState = Native.RedirectState;

export const registerForPushNotifications: typeof Native.registerForPushNotifications =
  async () => {};

// Aucun jeton à supprimer sur le web.
export const signOut: typeof Native.signOut = async () => {
  clearPhotoUrlCache();
  await supabase.auth.signOut();
};

export const usePushRegistration: typeof Native.usePushRegistration = () => {};

export const useNotificationRedirect: typeof Native.useNotificationRedirect = () => {};
