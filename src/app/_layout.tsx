import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { Stack } from "expo-router";

import { LoadingScreen, ProfileErrorScreen } from "@/components/status-screens";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/theme";

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
    return <ProfileErrorScreen onRetry={retry} />;
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
        <Stack.Screen name="index" options={{ title: "On mange quoi ?" }} />
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
