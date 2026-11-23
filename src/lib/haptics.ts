import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Retours haptiques (étude du 2026-11-20) : 4 moments seulement, toujours avec un retour
// visuel (jamais seuls). Sur Android, performAndroidHapticsAsync passe par le moteur
// haptique du système : il respecte le réglage « vibrations au toucher » du téléphone et
// ne demande pas la permission VIBRATE. Rien sur le web.
//
// Jamais bloquant : un téléphone sans moteur haptique (ou une constante trop récente pour
// son Android) ne doit faire échouer aucune action.

function run(android: Haptics.AndroidHaptics, ios: () => Promise<void>): void {
  if (Platform.OS === "web") return;
  const effect = Platform.OS === "android" ? Haptics.performAndroidHapticsAsync(android) : ios();
  effect.catch(() => {});
}

// 1. Cocher / décocher un plat ou un resto.
export function hapticToggle(isOn: boolean): void {
  run(isOn ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off, () =>
    Haptics.selectionAsync(),
  );
}

// 2. La roulette : un petit clic à chaque plat qui passe (très doux, répété vite).
export function hapticTick(): void {
  run(Haptics.AndroidHaptics.Segment_Frequent_Tick, () => Haptics.selectionAsync());
}

// 3. Le résultat : la roulette s'arrête, ou « C'est décidé » / « Commande passée ».
export function hapticConfirm(): void {
  run(Haptics.AndroidHaptics.Confirm, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

// 4. Une action refusée (vote déjà clos, plat en double, commande figée).
export function hapticReject(): void {
  run(Haptics.AndroidHaptics.Reject, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
}
