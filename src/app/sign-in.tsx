import { router } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/components/logo";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useTheme, type Theme } from "@/theme";

export default function SignIn() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    // TODO(human): envoyer le code par email, puis aller à l'écran de saisie du code.
    // Indices :
    //   - Nettoie l'email avant de l'utiliser (espaces autour, majuscules ?).
    //   - Refuse tout de suite un email vide, sans appeler le serveur.
    //   - L'appel : supabase.auth.signInWithOtp({ email }) renvoie { error }.
    //     Il ne lève pas d'exception : c'est à toi de regarder `error`.
    //   - Pendant l'appel : isSending à true (le bouton se désactive), et pense
    //     à le remettre à false dans TOUS les cas, succès comme échec.
    //   - En cas de succès : router.push({ pathname: "/verify", params: { email } })
    //   - En cas d'échec : un message compréhensible dans setError, pas le message technique brut.
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
