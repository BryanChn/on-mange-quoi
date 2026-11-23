import { Platform, Share } from "react-native";

import { soireeLink } from "./soirees";

// Partage du lien : la feuille de partage du téléphone (WhatsApp, SMS…). Sur le web, Share
// passe par navigator.share s'il existe ; sinon on copie le lien. Renvoie ce qui s'est passé,
// pour que l'écran le dise (« Lien copié »).
// Le message donne le lien (navigateur, sans compte) et le code (dans l'app, avec son compte).
export async function shareSoiree(
  name: string,
  joinToken: string,
  inviteCode: string,
): Promise<"shared" | "copied"> {
  const url = soireeLink(joinToken);
  const message = `Rejoins ma soirée « ${name} » sur On mange quoi ? ${url}\nTu as déjà l’app ? « Rejoindre avec un code » : ${inviteCode}`;

  if (Platform.OS === "web" && typeof navigator !== "undefined" && !navigator.share) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }
  await Share.share({ message });
  return "shared";
}

// Le récapitulatif de la commande : copié sur le web, partagé sur téléphone (vers les notes,
// WhatsApp…). Pas de presse-papiers natif sans module (expo-clipboard demanderait un APK).
export async function shareOrderText(text: string): Promise<"shared" | "copied"> {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  await Share.share({ message: text });
  return "shared";
}
