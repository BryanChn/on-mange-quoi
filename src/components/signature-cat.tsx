import { Image } from "expo-image";

import { useTheme } from "@/theme";

type SignatureCatProps = {
  size: number;
};

// Le chat OMQ posé sur la carte signature : son visage a la couleur de la carte, donc une
// image par thème (pas de react-native-svg dans l'APK pour recolorer un seul dessin).
// Décoratif : le texte de la carte dit tout, un lecteur d'écran n'a rien à lire ici.
export function SignatureCat({ size }: SignatureCatProps) {
  const { scheme } = useTheme();
  const source =
    scheme === "dark"
      ? require("@/assets/images/omq-chat-signature-sombre.svg")
      : require("@/assets/images/omq-chat-signature-clair.svg");

  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
