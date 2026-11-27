import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { playFirstSupported } from "./haptics-rules";

// Retours haptiques (étude du 2026-11-20, ajout réussi le 2026-11-25, repli Android le
// 2026-11-27) : peu de moments, toujours avec un retour visuel (jamais seuls), comme le
// recommandent Android et Apple. Sur Android, performAndroidHapticsAsync passe par le moteur
// haptique du système : il respecte le réglage « vibrations au toucher » du téléphone et ne
// demande pas la permission VIBRATE. Rien sur le web.
//
// Chaque effet Android a un repli : Toggle et Segment n'existent qu'à partir d'Android 14,
// Confirm et Reject d'Android 11. Avant ce repli, un téléphone plus ancien ne vibrait pas du
// tout sur ces gestes, sans aucune erreur visible (la roulette restait muette).
type AndroidEffect = Haptics.AndroidHaptics;
const A = Haptics.AndroidHaptics;

function run(android: readonly AndroidEffect[], ios: () => Promise<void>): void {
  if (Platform.OS === "web") return;
  if (Platform.OS === "android") {
    void playFirstSupported(android, (effect) => Haptics.performAndroidHapticsAsync(effect));
    return;
  }
  ios().catch(() => {});
}

// 1. Cocher / décocher un plat, un resto, un article, un réglage.
export function hapticToggle(isOn: boolean): void {
  run(isOn ? [A.Toggle_On, A.Virtual_Key] : [A.Toggle_Off, A.Clock_Tick], () =>
    Haptics.selectionAsync(),
  );
}

// 2. Un cran : chaque plat qui passe dans la roulette, une part de plus ou de moins, une
// étape du mode cuisine. Le tic d'horloge des sélecteurs d'heure, présent sur tout Android
// (Segment_Frequent_Tick, plus discret, ne se sentait presque pas et manquait avant Android 14).
export function hapticTick(): void {
  run([A.Clock_Tick], () => Haptics.selectionAsync());
}

// 3. Le résultat : la roulette s'arrête, ou « C'est décidé » / « Commande passée ».
export function hapticConfirm(): void {
  run([A.Confirm, A.Context_Click], () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

// 4. Un ajout réussi (un apport, une ligne de commande, un article de courses), après la
// réponse du serveur. Même effet que cocher un plat : le petit clic, fait pour être répété
// vite, ne se sentait pas sur un geste isolé (retour d'usage du 2026-11-25).
export function hapticAdded(): void {
  run([A.Toggle_On, A.Virtual_Key], () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

// 5. Une action refusée (vote déjà clos, plat en double, commande figée).
export function hapticReject(): void {
  run([A.Reject, A.Long_Press], () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
}

// 6. Un appui long qui ouvre quelque chose (modifier un article de courses) : Android le fait
// pour ses vues natives, pas pour le Pressable de React Native.
export function hapticLongPress(): void {
  run([A.Long_Press], () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
