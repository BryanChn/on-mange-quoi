import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import { useEffect, useEffectEvent, useState } from "react";
import { AppState } from "react-native";

import { isNewlyUpdated, shouldReloadOnResume } from "./app-version";

// Au plus une vérification par minute en revenant dans l'app : passer d'une app à l'autre
// ne doit pas lancer une requête à chaque fois.
const MIN_CHECK_INTERVAL_MS = 60_000;

// Identifiant de la dernière mise à jour annoncée (« L'app vient d'être mise à jour »).
const LAST_ANNOUNCED_UPDATE_KEY = "omq:last-announced-update";

// false en développement (Expo Go, npm run dev) : les mises à jour EAS n'y existent pas.
export const canCheckForUpdates = Updates.isEnabled && !__DEV__;

// Cherche une mise à jour et la télécharge. Elle s'applique au prochain redémarrage.
export async function fetchLatestUpdate(): Promise<"upToDate" | "downloaded"> {
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return "upToDate";
  await Updates.fetchUpdateAsync();
  return "downloaded";
}

// Redémarre l'app sur la mise à jour téléchargée.
export function restartOnLatestUpdate(): Promise<void> {
  return Updates.reloadAsync();
}

// Mises à jour sans intervention, en trois cas, au retour au premier plan :
// - absent depuis longtemps avec une mise à jour déjà téléchargée : rechargement immédiat,
//   avant le premier toucher (ressemble à un lancement normal) ;
// - sinon, vérification et téléchargement (au plus une fois par minute) : le bandeau de
//   l'accueil propose de redémarrer, ou la mise à jour s'appliquera au prochain retour ;
// - jamais de rechargement pendant que l'app est en arrière-plan (expérimental chez Expo).
// expo-updates seul ne vérifie qu'au lancement à froid. Effet légitime : il se synchronise
// avec un système externe (l'état de l'app chez Android / iOS).
export function useAutomaticUpdates() {
  const { isUpdatePending } = Updates.useUpdates();

  // useEffectEvent : lit isUpdatePending à jour depuis l'écouteur, sans le réabonner.
  const reloadIfDue = useEffectEvent((awayMs: number): boolean => {
    if (!shouldReloadOnResume({ awayMs, isUpdatePending })) return false;
    // Échec : la mise à jour s'appliquera au prochain lancement.
    restartOnLatestUpdate().catch(() => undefined);
    return true;
  });

  useEffect(() => {
    if (!canCheckForUpdates) return;

    // Le lancement vient de vérifier : pas de seconde requête tout de suite.
    let lastCheckAt = Date.now();
    let backgroundedAt: number | null = null;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (state !== "active") return;

      const awayMs = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (reloadIfDue(awayMs)) return;

      if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
      lastCheckAt = Date.now();
      // Échec (réseau) sans conséquence : on réessaiera au prochain retour dans l'app.
      fetchLatestUpdate().catch(() => undefined);
    });

    return () => subscription.remove();
  }, []);
}

// « L'app vient d'être mise à jour », une seule fois par mise à jour : l'identifiant annoncé
// est gardé sur le téléphone. Couvre le rechargement silencieux comme le lancement à froid.
export function useJustUpdated(): { justUpdated: boolean; dismiss: () => void } {
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    if (!canCheckForUpdates) return;
    const runningUpdateId = Updates.updateId;
    let isActive = true;

    AsyncStorage.getItem(LAST_ANNOUNCED_UPDATE_KEY)
      .then((lastAnnouncedId) => {
        if (!isActive || runningUpdateId === null) return;
        const state = { runningUpdateId, isEmbeddedLaunch: Updates.isEmbeddedLaunch };
        if (!isNewlyUpdated({ ...state, lastAnnouncedId })) return;
        setJustUpdated(true);
        // Mémorisé dès l'affichage : l'annonce ne revient pas au prochain passage.
        return AsyncStorage.setItem(LAST_ANNOUNCED_UPDATE_KEY, runningUpdateId);
      })
      // Stockage illisible : on n'annonce rien, l'app marche pareil.
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, []);

  return { justUpdated, dismiss: () => setJustUpdated(false) };
}
