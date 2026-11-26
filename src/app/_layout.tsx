import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { Stack, useSegments } from "expo-router";

import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { errorMessage } from "@/lib/network-errors";
import { useNotificationRedirect, usePushRegistration } from "@/lib/notifications";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { SessionProvider, useSession } from "@/lib/session";
import { useAutomaticUpdates } from "@/lib/updates";
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
  const { profile, isLoading: isProfileLoading, hasFailed, errorKind, retry } = useProfile();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const { colors, fonts } = useTheme();
  const segments = useSegments();
  // Invité d'une soirée : connexion anonyme, sans email. Il n'a accès qu'à sa soirée.
  const isGuest = session?.user.is_anonymous === true;
  // Page du lien d'une soirée (/rejoindre/<jeton>) : ouverte à tous, et elle gère elle-même son
  // chargement. Elle ne doit pas être démontée quand un invité se connecte (la session
  // change, le profil se recharge) : il perdrait son pseudo en pleine arrivée.
  const isJoinRoute = segments[0] === "rejoindre";
  // Avant les retours anticipés (règle des hooks). Seulement avec un profil : on ne
  // demande pas la permission sur l'écran de connexion ou de choix du nom. Jamais pour un
  // invité (pas de notification pour les invités, V1).
  usePushRegistration(profile && !isGuest ? session?.user.id : undefined);
  // Mises à jour EAS sans intervention : vérifiées au retour dans l'app, appliquées d'elles-
  // mêmes après une longue absence (voir src/lib/updates.ts).
  useAutomaticUpdates();
  // Ouvre le vote seulement une fois la pile de navigation montée avec les écrans protégés.
  // Profil en échec (réseau) : on attend le nouvel essai au lieu de jeter la notification.
  useNotificationRedirect(
    isLoading || !fontsLoaded || isProfileLoading || hasFailed
      ? "loading"
      : profile
        ? "ready"
        : "signedOut",
  );

  // Rien à afficher tant qu'on ne sait pas si l'utilisateur est connecté, ni avant
  // les polices : évite un flash de l'écran de connexion ou d'une police de secours.
  if (isLoading || !fontsLoaded) {
    return null;
  }

  // Tant que le profil n'est pas chargé, on ne sait pas s'il faut demander le nom.
  if (isProfileLoading && !isJoinRoute) {
    return <LoadingScreen />;
  }
  if (hasFailed && !isJoinRoute) {
    // Sans ce profil, impossible de savoir s'il faut demander le nom : on ne devine pas.
    return (
      <ErrorScreen
        title="On n’arrive pas à charger ton profil"
        message={errorMessage(errorKind ?? "other")}
        onRetry={retry}
        canSignOut
      />
    );
  }

  const isSignedIn = session !== null;
  const hasProfile = profile !== null;
  const isMember = hasProfile && !isGuest;

  // Toutes les gardes renvoient au même écran : celui qui correspond à l'état du compte.
  const homeRoute = !isSignedIn
    ? "/sign-in"
    : isGuest
      ? "/guest"
      : hasProfile
        ? "/"
        : "/choose-name";

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
      {/* Membres (compte avec email) seulement. */}
      <Stack.Protected guard={isMember} redirectTo={homeRoute}>
        {/* L'accueil porte son propre titre ; « Accueil » sert au libellé du bouton retour. */}
        <Stack.Screen name="index" options={{ title: "Accueil", headerShown: false }} />
        <Stack.Screen name="create-group" options={{ title: "Nouveau groupe" }} />
        <Stack.Screen name="join-group" options={{ title: "Rejoindre un groupe" }} />
        {/* Le nom du groupe est le grand titre de l'écran : l'en-tête ne garde que le retour. */}
        <Stack.Screen name="group/[id]" options={{ title: "" }} />
        {/* Titre : le nom du groupe, posé par l'écran une fois chargé. */}
        <Stack.Screen name="courses/index" options={{ title: "" }} />
        <Stack.Screen name="courses/[groupId]" options={{ title: "" }} />
        {/* Carnet et recette portent leur grand titre : l'en-tête garde le retour. */}
        <Stack.Screen name="recettes/index" options={{ title: "" }} />
        <Stack.Screen name="recettes/[groupId]" options={{ title: "" }} />
        <Stack.Screen name="recette/[id]" options={{ title: "" }} />
        <Stack.Screen name="recette/ecrire" options={{ title: "" }} />
        <Stack.Screen name="recette/courses" options={{ title: "" }} />
        {/* Plein écran : les étapes en grand, le quitter est dans l'écran lui-même. */}
        <Stack.Screen name="recette/cuisine" options={{ headerShown: false }} />
        {/* L'écran porte son grand titre (« C'est quoi le plan ? ») : l'en-tête garde le retour. */}
        <Stack.Screen name="soiree/new" options={{ title: "" }} />
        <Stack.Screen name="account" options={{ title: "Profil" }} />
      </Stack.Protected>

      {/* Membres et invités : la soirée et son vote « Où on mange ? ». */}
      <Stack.Protected guard={hasProfile} redirectTo={homeRoute}>
        <Stack.Screen name="soiree/[id]" options={{ title: "" }} />
        <Stack.Screen name="session/[id]" options={{ title: "Le vote" }} />
      </Stack.Protected>

      {/* Invité arrivé sans lien (page rechargée, onglet rouvert) : renvoyé à sa soirée. */}
      <Stack.Protected guard={isGuest} redirectTo={homeRoute}>
        <Stack.Screen name="guest" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && !hasProfile && !isGuest} redirectTo={homeRoute}>
        <Stack.Screen name="choose-name" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn} redirectTo={homeRoute}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ title: "Ton code" }} />
      </Stack.Protected>

      {/* Lien d'une soirée : sans garde, avec ou sans compte. */}
      <Stack.Screen name="rejoindre/[token]" options={{ headerShown: false }} />
    </Stack>
  );
}
