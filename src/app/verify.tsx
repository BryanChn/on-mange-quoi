import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

function getCodeError(cleanCode: string): string | null {
  if (cleanCode === "") return "Entre le code à 6 chiffres reçu par email.";
  if (!/^\d{6}$/.test(cleanCode)) return "Ce code n'est pas valide !";
  return null;
}

export default function Verify() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    const cleanCode = code.replace(/\s/g, "");
    const codeError = getCodeError(cleanCode);
    if (codeError) {
      setError(codeError);
      return;
    }
    setError(null);
    setIsVerifying(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: cleanCode,
        type: "email",
      });
      if (verifyError) {
        setError("Code incorrect ou expiré. Vérifie-le ou redemande un code.");
        return;
      }
    } catch {
      setError("La connexion n’a pas fonctionné. Vérifie ton réseau et réessaie.");
    } finally {
      setIsVerifying(false);
    }
  }

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
        onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
        error={error}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
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
