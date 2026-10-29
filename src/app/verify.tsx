import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

export default function Verify() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    // TODO(human): vérifier le code reçu par email.
    // Indices :
    //   - Le code contient uniquement des chiffres : refuse tout de suite un code incomplet.
    //   - L'appel : supabase.auth.verifyOtp({ email, token: code, type: "email" }) renvoie { error }.
    //   - Même gestion que l'écran précédent : isVerifying, error, remise à false dans tous les cas.
    //   - En cas de succès, tu n'as RIEN à faire pour la navigation : la session change,
    //     le layout (Stack.Protected) bascule tout seul vers l'accueil. Pourquoi ?
    //   - Code faux ou expiré : un message clair, et l'utilisateur doit pouvoir réessayer.
  }

  // Ouvert sans email (lien direct, appli rouverte sur cet écran) : rien à vérifier.
  if (!email) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          Vérifie tes emails
        </Text>
        <Text style={styles.subtitle}>
          Code envoyé à <Text style={styles.email}>{email}</Text>
        </Text>
      </View>

      <TextField
        label="Code à 6 chiffres"
        value={code}
        onChangeText={setCode}
        error={error}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        editable={!isVerifying}
        onSubmitEditing={handleVerify}
        style={styles.codeInput}
      />
      <PrimaryButton label="Valider" onPress={handleVerify} isLoading={isVerifying} />
    </KeyboardAvoidingView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: "center" },
    intro: { gap: spacing.sm },
    title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    subtitle: { fontSize: fontSize.body, color: colors.textMuted },
    email: { color: colors.text, fontWeight: "600" },
    codeInput: { fontSize: 26, letterSpacing: 8, textAlign: "center" },
  });
}
