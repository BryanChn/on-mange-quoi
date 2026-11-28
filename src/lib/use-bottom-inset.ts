import { useSyncExternalStore } from "react";
import { Keyboard, Platform } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";

// La marge à garder sous ce qui est fixé en bas d'écran (sticky footer, form sheet). Sur
// Android, la marge basse vaut parfois 0 alors que la barre de navigation (3 boutons : ~48 dp)
// passe par-dessus : on reprend celle de la fenêtre au lancement, avec un minimum pour la
// barre gestuelle. Là où la marge est juste, le résultat ne change pas.
const MIN_BOTTOM_INSET = 16;

export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0, MIN_BOTTOM_INSET);
}

// Le clavier est un système extérieur à React : on s'y abonne avec useSyncExternalStore
// plutôt qu'un effet. iOS prévient avant l'animation (« will »), Android seulement après.
const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

// L'état vient de l'événement lui-même : sur iOS, « will » arrive avant que
// Keyboard.isVisible() ne change.
let isKeyboardVisible = Keyboard.isVisible();

function subscribeToKeyboard(onChange: () => void): () => void {
  // Sans abonné, personne n'a suivi le clavier : on repart de son état réel.
  isKeyboardVisible = Keyboard.isVisible();
  const show = Keyboard.addListener(showEvent, () => {
    isKeyboardVisible = true;
    onChange();
  });
  const hide = Keyboard.addListener(hideEvent, () => {
    isKeyboardVisible = false;
    onChange();
  });
  return () => {
    show.remove();
    hide.remove();
  };
}

// Pendant la saisie, un sticky footer prend de la place au-dessus du clavier et garde la
// marge de la barre que le clavier recouvre : l'écran le masque tant que le clavier est ouvert.
export function useIsKeyboardVisible(): boolean {
  return useSyncExternalStore(subscribeToKeyboard, () => isKeyboardVisible);
}
