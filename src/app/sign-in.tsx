import { Logo } from "@/components/logo";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function getEmailError(cleanEmail: string): string | null {
  if (cleanEmail === "") return "Entre ton email pour recevoir le code de connexion";
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return "Cet email ne me semble pas valide !";
  return null;
}

export default function SignIn() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    const cleanEmail = email.trim().toLowerCase();
    const emailError = getEmailError(cleanEmail);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError(null);
    setIsSending(true);

    try {
      // Le compte est créé automatiquement à la première connexion.
      const { error: sendError } = await supabase.auth.signInWithOtp({ email: cleanEmail });

      // Échec prévu : Supabase a répondu, mais avec une erreur (trop de demandes…).
      if (sendError) {
        setError("Impossible d’envoyer le code. Réessaie dans un instant.");
        return;
      }
      // L'écran du code a besoin de l'email pour le vérifier.
      router.push({ pathname: "/verify", params: { email: cleanEmail } });
    } catch {
      // Échec imprévu : l'appel a planté (réseau coupé, serveur injoignable).
      setError("Pas de connexion ? Vérifie ton réseau et réessaie.");
    } finally {
      // Succès, échec ou plantage : le bouton redevient utilisable.
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.hero}>
          <Logo width={240} />
          <Text style={styles.title} accessibilityRole="header">
            On mange quoi <Text style={styles.questionMark}>?</Text>
          </Text>
          <Text style={styles.tagline}>
            De « on mange quoi ? » à « c’est réglé » en moins de 2 minutes.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Ton email"
            value={email}
            onChangeText={setEmail}
            error={error}
            placeholder="toi@exemple.fr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!isSending}
            onSubmitEditing={handleSendCode}
          />
          <PrimaryButton label="Recevoir mon code" onPress={handleSendCode} isLoading={isSending} />
          <Text style={styles.hint}>
            Pas de mot de passe : un code à 6 chiffres arrive par email.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.xl,
    },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
    title: {
      fontFamily: fonts.display,
      fontSize: fontSize.title,
      color: colors.text,
      textAlign: "center",
    },
    questionMark: { color: colors.primary },
    tagline: {
      fontSize: fontSize.body,
      lineHeight: 26,
      color: colors.textMuted,
      textAlign: "center",
    },
    form: { gap: spacing.md },
    hint: { fontSize: fontSize.small, color: colors.textMuted, textAlign: "center" },
  });
}
