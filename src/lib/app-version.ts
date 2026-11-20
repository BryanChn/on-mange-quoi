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

export type UpdateBanner = "downloading" | "ready" | "updated" | null;

// Au retour dans l'app après une absence de cette durée, une mise à jour déjà téléchargée
// s'applique d'elle-même : l'utilisateur ne s'attend plus à retrouver l'écran exact qu'il
// avait quitté (recommandation Expo ; 10 min comme l'exemple CodePush de Microsoft).
export const SILENT_RELOAD_AFTER_MS = 10 * 60 * 1000;

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

// Une seule annonce à la fois, par ordre d'utilité : une version prête à appliquer, puis un
// téléchargement en cours, puis « vient d'être mise à jour ».
export function updateBanner(state: {
  isDownloading: boolean;
  isUpdatePending: boolean;
  justUpdated: boolean;
}): UpdateBanner {
  if (state.isUpdatePending) return "ready";
  if (state.isDownloading) return "downloading";
  if (state.justUpdated) return "updated";
  return null;
}

// Recharger seulement si une mise à jour attend déjà ET si l'absence a été longue : jamais
// en plein geste (un téléchargement lancé au retour finit pendant que l'utilisateur coche).
export function shouldReloadOnResume(state: { awayMs: number; isUpdatePending: boolean }): boolean {
  return state.isUpdatePending && state.awayMs >= SILENT_RELOAD_AFTER_MS;
}

// La version qui tourne est une mise à jour pas encore annoncée à l'utilisateur. La version
// de l'APK ne s'annonce pas : c'est celle qu'il vient d'installer.
export function isNewlyUpdated(state: {
  runningUpdateId: string | null;
  isEmbeddedLaunch: boolean;
  lastAnnouncedId: string | null;
}): boolean {
  return (
    !state.isEmbeddedLaunch &&
    state.runningUpdateId !== null &&
    state.runningUpdateId !== state.lastAnnouncedId
  );
}
