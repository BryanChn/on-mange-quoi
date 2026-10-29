import { useMemo } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { useTheme, type Theme } from "@/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
};

// Champ de saisie avec son libellé visible et son message d'erreur.
export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize }: Theme) {
  return StyleSheet.create({
    container: { gap: spacing.sm },
    label: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
    input: {
      height: 54,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      fontSize: fontSize.body,
      color: colors.text,
    },
    inputError: { borderColor: colors.danger },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
