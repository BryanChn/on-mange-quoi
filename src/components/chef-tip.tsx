import { Image } from "expo-image";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, type Theme } from "@/theme";

type ChefTipProps = {
  text: string;
};

// L'astuce du chef d'une recette, signée par le chat cuisinier (l'avatar « chat » coiffé d'une
// toque, contour rouge : lisible en clair et en sombre, une seule image). Lu d'un bloc par un
// lecteur d'écran : « L'astuce du chef : … ».
export function ChefTip({ text }: ChefTipProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.box} accessible accessibilityLabel={`L’astuce du chef : ${text}`}>
      <Image
        source={require("@/assets/images/chat-toque.svg")}
        style={styles.cat}
        contentFit="contain"
        accessible={false}
      />
      <View style={styles.body}>
        <Text style={styles.title}>L’astuce du chef</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fontSize }: Theme) {
  return StyleSheet.create({
    box: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
    },
    cat: { width: 44, height: 44 },
    body: { flex: 1, gap: spacing.xs },
    title: {
      fontSize: fontSize.caption,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.chipText,
    },
    text: { fontSize: fontSize.body, lineHeight: 24, color: colors.text },
  });
}
