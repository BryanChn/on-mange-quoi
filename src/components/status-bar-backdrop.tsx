import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

// Écran sans en-tête qui défile : sans fond derrière la barre d'état, le contenu passe
// sous l'heure et la batterie. Une bande opaque, couleur du fond, à la hauteur de la barre
// d'état : le contenu glisse dessous. À placer après le ScrollView (au-dessus de lui).
export function StatusBarBackdrop() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="none"
      style={[styles.backdrop, { height: insets.top, backgroundColor: theme.colors.background }]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0 },
});
