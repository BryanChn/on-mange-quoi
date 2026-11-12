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
  // Un cran sous surface : ligne de plat, pastille, tout ce qui se pose dans une carte.
  surface2: "#FBE6D2",
  text: brand.espresso,
  textMuted: "#6B5244",
  // Séparateurs décoratifs uniquement : trop pâle pour délimiter un champ.
  border: "#EBD5BF",
  inputBorder: "#9C836F",
  // Fond des boutons : la tomate vive ne laisse que 3,98:1 au texte blanc, la foncée 5,25:1.
  primary: brand.tomateFonce,
  primaryStrong: "#A82A1B",
  onPrimary: "#FFFFFF",
  // Tomate vive, sans texte dessus : contour d'un plat coché, point d'une étiquette (3:1).
  brand: brand.tomate,
  // Étiquette (« vote en cours ») et initiale d'un groupe.
  chipBg: "#FFE2DA",
  chipText: brand.sauce,
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
  surface2: "#2B2928",
  text: "#F5EDE6",
  textMuted: "#ADA39C",
  border: "#2E2B29",
  inputBorder: "#736A64",
  // Corail désaturé : la tomate pure éblouit sur fond sombre.
  primary: "#F2796A",
  primaryStrong: "#F59486",
  onPrimary: "#1A100E",
  brand: "#F2796A",
  chipBg: "#3A2724",
  chipText: "#F7A396",
  accent: "#E9C46A",
  onAccent: brand.espresso,
  success: "#6CC08B",
  danger: "#F2A39A",
};

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// md : champ, ligne. lg : liste groupée. xl : carte.
const radius = { md: 16, lg: 22, xl: 28, pill: 999 } as const;

// En clair, une carte blanche sur la crème ne se détache que par son ombre (1,11:1).
// En sombre, pas d'ombre : la profondeur vient des surfaces plus claires.
const cardShadow = "0 1px 2px rgba(42, 23, 18, 0.06), 0 6px 18px rgba(42, 23, 18, 0.06)";

// Fonds des avatars, toujours avec le texte espresso dessus (contraste ≥ 9:1).
const avatarColors = [brand.spaghetti, "#CDE8D6", "#FFD3C9"] as const;
const onAvatar = brand.espresso;

// Les noms doivent correspondre aux polices chargées dans src/app/_layout.tsx.
const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
} as const;

const fontSize = { caption: 13, small: 14, body: 17, button: 18, heading: 26, title: 38 } as const;

const lightTheme = {
  scheme: "light" as const,
  colors: lightColors,
  cardShadow: cardShadow as string | undefined,
  avatarColors,
  onAvatar,
  spacing,
  radius,
  fonts,
  fontSize,
};
const darkTheme = {
  scheme: "dark" as const,
  colors: darkColors,
  cardShadow: undefined as string | undefined,
  avatarColors,
  onAvatar,
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
