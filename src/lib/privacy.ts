import { Linking } from "react-native";

// Page publique exigée par les stores (Apple, Google Play) : le fichier du dépôt GitHub,
// qui est public. Pour la déplacer (site, Expo Web), changer seulement cette adresse.
export const PRIVACY_POLICY_URL =
  "https://github.com/BryanChn/on-mange-quoi/blob/main/docs/politique-de-confidentialite.md";

// Ouvre la politique dans le navigateur du téléphone. Linking fait partie de React Native :
// aucun module natif en plus, donc publiable par mise à jour EAS, sans nouvel APK.
export async function openPrivacyPolicy(): Promise<void> {
  try {
    await Linking.openURL(PRIVACY_POLICY_URL);
  } catch (error) {
    // Seul cas d'échec : aucun navigateur sur le téléphone. Rien d'utile à afficher.
    if (__DEV__) console.warn("Politique de confidentialité non ouverte", error);
  }
}
