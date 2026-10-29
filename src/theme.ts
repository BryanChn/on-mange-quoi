import { useColorScheme } from "react-native";

// Design tokens : la seule source des couleurs, espacements et typos de l'app.
// Un écran ne contient jamais de valeur en dur (#E8432F, 24…) : il pioche ici.
// Couleurs de la charte OMQ (chat spaghetti).

const brand = {
  tomate: "#E8432F",
  tomateFonce: "#C93421",
  creme: "#FFF1E2",
  espresso: "#2A1712",
  spaghetti: "#F6B828",
  basilic: "#2E8B57",
  sauce: "#8C1D12",
};

// Rôles plutôt que teintes : un écran demande « primary », pas « tomate ».
// Contrastes vérifiés (WCAG AA) : 4.5:1 pour le texte, 3:1 pour le contour d'un champ.
const lightColors = {
  background: brand.creme,
  surface: "#FFFFFF",
  text: brand.espresso,
  textMuted: "#6B5244",
  // Séparateurs décoratifs uniquement : trop pâle pour délimiter un champ.
  border: "#EBD5BF",
  inputBorder: "#9C836F",
  primary: brand.tomate,
  primaryStrong: brand.tomateFonce,
  onPrimary: "#FFFFFF",
  accent: brand.spaghetti,
  onAccent: brand.espresso,
  success: brand.basilic,
  // La tomate sur crème ne passe pas pour du petit texte : l'erreur prend la sauce.
  danger: brand.sauce,
};

// Charbon plutôt que brun : le brun très sombre et la tomate vive faisaient « Halloween ».
const darkColors: typeof lightColors = {
  background: "#161514",
  surface: "#211F1E",
  text: "#F5EDE6",
  textMuted: "#ADA39C",
  border: "#2E2B29",
  inputBorder: "#736A64",
  // Corail désaturé : la tomate pure éblouit sur fond sombre.
  primary: "#F2796A",
  primaryStrong: "#F59486",
  onPrimary: "#1A100E",
  accent: "#E9C46A",
  onAccent: brand.espresso,
  success: "#6CC08B",
  danger: "#F2A39A",
};

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

const radius = { md: 16, pill: 999 } as const;

// Les noms doivent correspondre aux polices chargées dans src/app/_layout.tsx.
const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
} as const;

const fontSize = { small: 14, body: 17, button: 18, title: 38 } as const;

const lightTheme = {
  scheme: "light" as const,
  colors: lightColors,
  spacing,
  radius,
  fonts,
  fontSize,
};
const darkTheme = {
  scheme: "dark" as const,
  colors: darkColors,
  spacing,
  radius,
  fonts,
  fontSize,
};

export type Theme = typeof lightTheme | typeof darkTheme;

// Suit le réglage clair / sombre du téléphone. Renvoie toujours le même objet
// pour un même mode : on peut s'en servir comme dépendance de useMemo.
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}
