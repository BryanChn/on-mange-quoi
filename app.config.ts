import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json reste la configuration de référence (Expo la passe ici dans `config`).
// Ce fichier n'ajoute que ce qui dépend de l'environnement de build.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    // Chemin du google-services.json écrit par EAS au build (variable de type File,
    // environnement preview). Absent en local : Expo Go ne reçoit pas de push Android.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
  },
});
