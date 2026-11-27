import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useTheme, type Theme } from "@/theme";

type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
};

// Champ de recherche discret (refonte v4) : fond teinté, loupe, pas d'étiquette au-dessus.
// Le texte d'aide sert aussi de nom pour le lecteur d'écran.
export function SearchField({ value, onChangeText, placeholder }: SearchFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.field}>
      <Feather name="search" size={18} color={theme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={styles.input}
      />
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize, control }: Theme) {
  return StyleSheet.create({
    field: {
      height: control.md,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
    },
    input: { flex: 1, height: "100%", color: colors.text, fontSize: fontSize.body },
  });
}
