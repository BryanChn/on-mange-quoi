import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/bricolage-grotesque";
import { Stack } from "expo-router";

import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const { colors, fonts } = useTheme();

  // Rien à afficher tant qu'on ne sait pas si l'utilisateur est connecté, ni avant
  // les polices : évite un flash de l'écran de connexion ou d'une police de secours.
  if (isLoading || !fontsLoaded) {
    return null;
  }

  const isSignedIn = session !== null;

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

      <Stack.Protected guard={isSignedIn} redirectTo="/sign-in">
        <Stack.Screen name="index" options={{ title: "On mange quoi ?" }} />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn} redirectTo="/">
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ title: "Ton code" }} />
      </Stack.Protected>
    </Stack>
  );
}
