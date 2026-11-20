import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState } from "react-native";

// Au plus une vérification par minute en revenant dans l'app : passer d'une app à l'autre
// ne doit pas lancer une requête à chaque fois.
const MIN_CHECK_INTERVAL_MS = 60_000;

// false en développement (Expo Go, npm run dev) : les mises à jour EAS n'y existent pas.
export const canCheckForUpdates = Updates.isEnabled && !__DEV__;

// Cherche une mise à jour et la télécharge. Elle s'applique au prochain redémarrage
// (bandeau de l'accueil, ou Updates.reloadAsync).
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

// expo-updates ne vérifie qu'au lancement à froid. Une app laissée en arrière-plan des
// heures ne voyait donc jamais les mises à jour : on vérifie aussi en revenant au premier
// plan. Effet légitime : il se synchronise avec un système externe (l'état de l'app chez
// Android / iOS).
export function useUpdateCheckOnForeground() {
  useEffect(() => {
    if (!canCheckForUpdates) return;

    // Le lancement vient de vérifier : pas de seconde requête tout de suite.
    let lastCheckAt = Date.now();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
      lastCheckAt = Date.now();
      // Échec (réseau) sans conséquence : useUpdates() expose l'erreur, on réessaiera au
      // prochain retour dans l'app.
      fetchLatestUpdate().catch(() => undefined);
    });

    return () => subscription.remove();
  }, []);
}
