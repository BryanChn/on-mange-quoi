import { Image } from "expo-image";

import { useTheme } from "@/theme";

// Rapport largeur / hauteur du viewBox des SVG « symbole » (492.89 × 226).
const ASPECT_RATIO = 492.89 / 226;

type LogoProps = {
  width: number;
};

// Symbole OMQ (le chat et ses lettres), dans la version adaptée au mode clair ou sombre.
export function Logo({ width }: LogoProps) {
  const { scheme } = useTheme();
  const source =
    scheme === "dark"
      ? require("@/assets/images/omq-symbole-nuit.svg")
      : require("@/assets/images/omq-symbole-pomodoro.svg");

  return (
    <Image
      source={source}
      style={{ width, height: width / ASPECT_RATIO }}
      contentFit="contain"
      accessibilityLabel="Logo On mange quoi"
    />
  );
}
