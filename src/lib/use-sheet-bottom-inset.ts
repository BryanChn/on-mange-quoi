import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";

// La marge à garder sous le contenu d'une form sheet. Sur Android, la feuille reçoit souvent
// une marge basse à 0 alors que la barre de navigation (3 boutons : ~48 dp) passe par-dessus :
// on reprend celle de la fenêtre au lancement, avec un minimum pour la barre gestuelle.
const MIN_BOTTOM_INSET = 16;

export function useSheetBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0, MIN_BOTTOM_INSET);
}
