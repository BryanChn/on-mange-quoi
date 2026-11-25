import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { notificationTarget } from "./notification-link";
import { clearPhotoUrlCache } from "./photo-storage";
import { supabase } from "./supabase";

// Notifications push (MVP) : lancement et résultat d'un vote. L'envoi se fait côté serveur ;
// l'app se contente d'enregistrer le jeton du téléphone (table push_tokens).

// App ouverte : la notification s'affiche quand même en bannière, sinon elle serait avalée.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;

// Pas de jeton possible : sur le web, dans Expo Go (plus de push Android depuis le SDK 53),
// ni sur un émulateur.
function canReceivePush(): boolean {
  return (
    Platform.OS !== "web" &&
    Device.isDevice &&
    Constants.executionEnvironment !== "storeClient" &&
    projectId !== undefined
  );
}

// Android 13+ : le canal doit exister AVANT la demande de permission, sinon la fenêtre
// système ne s'affiche pas. « default » : celui qu'Expo utilise si l'envoi n'en précise pas.
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Votes",
    importance: AndroidImportance.HIGH,
  });
}

// Jeton Expo de ce téléphone, sans rien demander à l'utilisateur.
// null si les notifications sont impossibles ou pas autorisées.
async function getPushToken(): Promise<string | null> {
  if (!canReceivePush()) return null;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

// Demande la permission si besoin, puis enregistre le jeton pour le membre connecté.
// Refus de l'utilisateur : pas une erreur, l'app reste utilisable sans notifications.
export async function registerForPushNotifications(): Promise<void> {
  if (!canReceivePush()) return;
  await ensureAndroidChannel();

  let permission = await Notifications.getPermissionsAsync();
  // canAskAgain faux : le membre a refusé pour de bon. Android ignore alors la demande
  // sans rien afficher ; seuls les réglages du téléphone peuvent la rouvrir.
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return;

  const token = await getPushToken();
  if (!token) return;

  const { error } = await supabase.rpc("register_push_token", { new_token: token });
  if (error) throw error;
}

// Déconnexion de l'app : à utiliser à la place de supabase.auth.signOut().
export async function signOut(): Promise<void> {
  // Le jeton d'abord : après signOut(), auth.uid() est nul et la RLS « Un membre supprime
  // ses jetons » filtrerait la ligne sans renvoyer d'erreur.
  try {
    const token = await getPushToken();
    if (token) {
      const { error } = await supabase.from("push_tokens").delete().eq("token", token);
      if (error) throw error;
    }
  } catch (error) {
    // On déconnecte quand même : rester coincé connecté (sans réseau) est pire qu'un jeton
    // oublié, qui changera de propriétaire à la prochaine connexion sur ce téléphone.
    if (__DEV__) console.warn("Jeton push non supprimé à la déconnexion", error);
  }
  clearPhotoUrlCache();
  await supabase.auth.signOut();
}

// Enregistre le jeton dès qu'un membre a un profil, et à chaque changement de compte.
// Ré-enregistré à chaque lancement : si Expo a changé le jeton, la table suit.
// Effet justifié : on se synchronise avec un système externe (permissions du téléphone).
export function usePushRegistration(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications().catch((error: unknown) => {
      // Sans notifications, l'app reste utilisable : on ne bloque aucun écran.
      if (__DEV__) console.warn("Enregistrement des notifications impossible", error);
    });
  }, [userId]);
}

// État de l'app vu par la redirection :
// - loading : session, profil ou polices pas encore chargés, l'écran du vote n'existe pas ;
// - ready : membre avec profil, la pile de navigation est montée ;
// - signedOut : pas de compte (ou pas encore de nom) sur ce téléphone.
export type RedirectState = "loading" | "ready" | "signedOut";

// Toucher une notification ouvre le vote concerné (lancement : pour voter ; résultat : pour
// voir le plat). Au démarrage à froid, le toucher attend que l'app soit prête.
// Effet justifié : on réagit à un événement extérieur (le système transmet le toucher).
export function useNotificationRedirect(state: RedirectState): void {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (state === "loading" || !response) return;

    // Effacée dans tous les cas : sinon le même vote se rouvrirait à chaque remontage, ou
    // après une reconnexion des heures plus tard (ou sous un autre compte).
    Notifications.clearLastNotificationResponse();
    if (state === "signedOut") return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const target = notificationTarget(response.notification.request.content.data);
    if (target?.kind === "session") {
      router.push({ pathname: "/session/[id]", params: { id: target.id } });
    } else if (target?.kind === "soiree") {
      router.push({ pathname: "/soiree/[id]", params: { id: target.id } });
    }
  }, [state, response]);
}
