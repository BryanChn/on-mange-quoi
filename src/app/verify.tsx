import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

const RESEND_DELAY_MS = 60_000;

function getCodeError(cleanCode: string): string | null {
  if (cleanCode === "") return "Entre le code à 6 chiffres reçu par email.";
  if (!/^\d{6}$/.test(cleanCode)) return "Ce code n'est pas valide !";
  return null;
}

function getSecondsLeft(resendAvailableAt: number, now: number): number {
  const msLeft = resendAvailableAt - now;
  const seconds = Math.ceil(msLeft / 1000);
  return Math.max(seconds, 0);
}

export default function Verify() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const headerHeight = useHeaderHeight();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(() => Date.now() + RESEND_DELAY_MS);
  // L'heure courante vit dans un state : un rendu React ne doit pas appeler Date.now().
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = getSecondsLeft(resendAvailableAt, now);

  // Rafraîchit l'heure chaque seconde pour que le compte à rebours avance à l'écran.
  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  async function handleResend() {
    setError(null);
    setIsResending(true);

    try {
      const { error: sendError } = await supabase.auth.signInWithOtp({ email });
      if (sendError) {
        setError("Impossible de renvoyer un code tout de suite.");
        return;
      }
      const sentAt = Date.now();
      setNow(sentAt);
      setResendAvailableAt(sentAt + RESEND_DELAY_MS);
      setCode("");
    } catch {
      // Échec imprévu : l'appel a planté (réseau coupé, serveur injoignable).
      setError("Pas de connexion ? Vérifie ton réseau et réessaie.");
    } finally {
      // Succès, échec ou plantage : le bouton redevient utilisable.
      setIsResending(false);
    }
  }

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
        setError(
          "Code incorrect ou expiré. Vérifie-le ou utilise « Renvoyer le code » ci-dessous.",
        );
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
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
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

      <View style={styles.actions}>
        <TextButton
          label={secondsLeft > 0 ? `Renvoyer le code (${secondsLeft} s)` : "Renvoyer le code"}
          onPress={handleResend}
          isDisabled={secondsLeft > 0 || isResending}
        />
        <TextButton label="Changer d'email" onPress={() => router.back()} />
      </View>
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
    actions: { gap: spacing.xs },
  });
}
