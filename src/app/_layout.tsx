import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { Stack } from "expo-router";

import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/theme";

// Arrivée directe sur un écran (rechargement web, lien partagé) : l'accueil est placé
// dessous, pour que la flèche de retour existe toujours.
export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  return (
    <SessionProvider>
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  const { profile, isLoading: isProfileLoading, hasFailed, retry } = useProfile();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const { colors, fonts } = useTheme();

  // Rien à afficher tant qu'on ne sait pas si l'utilisateur est connecté, ni avant
  // les polices : évite un flash de l'écran de connexion ou d'une police de secours.
  if (isLoading || !fontsLoaded) {
    return null;
  }

  // Tant que le profil n'est pas chargé, on ne sait pas s'il faut demander le nom.
  if (isProfileLoading) {
    return <LoadingScreen />;
  }
  if (hasFailed) {
    // Sans ce profil, impossible de savoir s'il faut demander le nom : on ne devine pas.
    return (
      <ErrorScreen
        title="Impossible de charger ton profil"
        message="Vérifie ton réseau et réessaie."
        onRetry={retry}
        canSignOut
      />
    );
  }

  const isSignedIn = session !== null;
  const hasProfile = profile !== null;

  // Toutes les gardes renvoient au même écran : celui qui correspond à l'état du compte.
  const homeRoute = hasProfile ? "/" : isSignedIn ? "/choose-name" : "/sign-in";

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.displayBold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={hasProfile} redirectTo={homeRoute}>
        {/* L'accueil porte son propre titre ; « Accueil » sert au libellé du bouton retour. */}
        <Stack.Screen name="index" options={{ title: "Accueil", headerShown: false }} />
        <Stack.Screen name="create-group" options={{ title: "Nouveau groupe" }} />
        <Stack.Screen name="join-group" options={{ title: "Rejoindre un groupe" }} />
        {/* Le nom du groupe est le grand titre de l'écran : l'en-tête ne garde que le retour. */}
        <Stack.Screen name="group/[id]" options={{ title: "" }} />
        <Stack.Screen name="session/[id]" options={{ title: "Le vote" }} />
        <Stack.Screen name="account" options={{ title: "Mon compte" }} />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && !hasProfile} redirectTo={homeRoute}>
        <Stack.Screen name="choose-name" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn} redirectTo={homeRoute}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ title: "Ton code" }} />
      </Stack.Protected>
    </Stack>
  );
}
