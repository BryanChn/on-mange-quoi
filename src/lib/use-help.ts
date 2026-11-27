import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

// L'aide d'un écran (HelpCard) : affichée d'elle-même la première fois, puis seulement à la
// demande (HelpButton). Retenu sur le téléphone, une clé par écran.
export function useHelp(key: string) {
  const storageKey = `omq.help.${key}`;
  // Faux tant qu'on ne sait pas : rien ne s'affiche puis disparaît.
  const [isVisible, setIsVisible] = useState(false);

  // Le stockage du téléphone est un système extérieur : on y lit une fois si l'aide a été vue.
  // En cas d'échec, on ne l'affiche pas (mieux vaut rien qu'un rappel à chaque ouverture).
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(
      (seen) => setIsVisible(seen === null),
      () => setIsVisible(false),
    );
  }, [storageKey]);

  return {
    isVisible,
    show: () => setIsVisible(true),
    dismiss: () => {
      setIsVisible(false);
      AsyncStorage.setItem(storageKey, "1").catch(() => undefined);
    },
  };
}
