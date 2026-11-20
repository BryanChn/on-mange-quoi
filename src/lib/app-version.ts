// Ce qui tourne sur le téléphone et l'état d'une mise à jour, en mots. Fonctions pures,
// sans import à l'exécution (testées avec node --test dans app-version.test.ts).

// Sous-ensemble de CurrentlyRunningInfo (expo-updates) utile à l'affichage.
export type RunningVersion = {
  isEmbeddedLaunch: boolean;
  // Une mise à jour a planté au lancement : expo-updates est revenu à la version de l'APK.
  isEmergencyLaunch: boolean;
  createdAt?: Date;
  updateId?: string;
};

export type UpdateBanner = "downloading" | "ready" | null;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

// « Mise à jour du 20/11 à 09:48 · 777ff9ba », « Version de l'APK ».
// L'identifiant court permet de comparer avec la liste des mises à jour d'EAS.
export function versionLabel(version: RunningVersion): string {
  if (version.isEmergencyLaunch) return "Version de secours (une mise à jour a planté)";
  if (version.isEmbeddedLaunch || !version.createdAt) return "Version de l’APK";

  const date = version.createdAt;
  const day = `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}`;
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  const shortId = version.updateId ? ` · ${version.updateId.slice(0, 8)}` : "";
  return `Mise à jour du ${day} à ${time}${shortId}`;
}

// Prête l'emporte sur le téléchargement : une fois téléchargée, il ne reste qu'à redémarrer.
export function updateBanner(state: {
  isDownloading: boolean;
  isUpdatePending: boolean;
}): UpdateBanner {
  if (state.isUpdatePending) return "ready";
  if (state.isDownloading) return "downloading";
  return null;
}
