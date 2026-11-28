import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { AisleIcon } from "@/components/aisle-icon";
import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { hapticAdded, hapticReject, hapticTick } from "@/lib/haptics";
import { failureMessage } from "@/lib/network-errors";
import {
  fetchShoppingList,
  removeShoppingItem,
  setShoppingItemAisle,
  setShoppingItemImportant,
  updateShoppingItem,
} from "@/lib/shopping";
import {
  AISLE_LABELS,
  findDuplicate,
  SHOPPING_AISLES,
  SHOPPING_LABEL_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX_LENGTH,
  type ShoppingAisle,
} from "@/lib/shopping-rules";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { useTheme, type Theme } from "@/theme";

// La fiche d'un article (form sheet, maquette du 27/11 : bouton ⋯ ou appui long) : son nom, sa
// quantité, son rayon (le foyer s'en souvient pour ce nom), l'étoile « indispensable », et
// retirer. Tout au même endroit, au-dessus du clavier.
export default function ShoppingItemSheet() {
  const params = useLocalSearchParams<{
    itemId: string;
    groupId: string;
    label: string;
    quantity?: string;
    aisle: ShoppingAisle;
    important?: string;
  }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const bottomInset = useBottomInset();
  const initialImportant = params.important === "1";
  const [label, setLabel] = useState(params.label);
  const [quantity, setQuantity] = useState(params.quantity ?? "");
  const [aisle, setAisle] = useState<ShoppingAisle>(params.aisle);
  const [isImportant, setIsImportant] = useState(initialImportant);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"saving" | "removing" | null>(null);

  async function handleSave() {
    const name = label.trim();
    if (name === "") {
      setLabelError("Écris le nom de l’article.");
      return;
    }
    setLabelError(null);
    setError(null);
    setBusy("saving");
    try {
      const isRenamed = name !== params.label || quantity.trim() !== (params.quantity ?? "");
      if (isRenamed) {
        // Pas de doublon : même règle que l'ajout.
        const duplicate = findDuplicate(
          await fetchShoppingList(params.groupId),
          name,
          params.itemId,
        );
        if (duplicate) {
          hapticReject();
          setLabelError(`« ${duplicate.label} » est déjà dans la liste.`);
          setBusy(null);
          return;
        }
        await updateShoppingItem(params.itemId, { label: name, quantity });
      }
      if (aisle !== params.aisle) {
        await setShoppingItemAisle({ id: params.itemId, label: name }, aisle);
      }
      if (isImportant !== initialImportant) {
        await setShoppingItemImportant(params.itemId, isImportant);
      }
      hapticAdded();
      // La liste se recharge en reprenant la main (useFocusEffect).
      router.back();
    } catch (cause) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été modifié", cause));
      setBusy(null);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy("removing");
    try {
      await removeShoppingItem(params.itemId);
      router.back();
    } catch (cause) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été retiré", cause));
      setBusy(null);
    }
  }

  return (
    <View style={styles.sheet}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">
          Article
        </Text>

        <View style={styles.fields}>
          <View style={styles.labelField}>
            <TextField
              label="Nom"
              value={label}
              onChangeText={setLabel}
              error={labelError}
              autoCapitalize="sentences"
              maxLength={SHOPPING_LABEL_MAX_LENGTH}
              editable={busy === null}
            />
          </View>
          <View style={styles.quantityField}>
            <TextField
              label="Quantité"
              value={quantity}
              onChangeText={setQuantity}
              maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
              editable={busy === null}
            />
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Rayon</Text>
          <View style={styles.grid} accessibilityRole="radiogroup">
            {SHOPPING_AISLES.map((option) => {
              const isSelected = option === aisle;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    hapticTick();
                    setAisle(option);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={AISLE_LABELS[option]}
                  style={({ pressed }) => [
                    styles.cell,
                    isSelected && styles.cellSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AisleIcon aisle={option} size={22} />
                  <Text style={[styles.cellLabel, isSelected && styles.cellLabelSelected]}>
                    {AISLE_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>Le foyer s’en souviendra pour ce nom.</Text>
        </View>

        <Pressable
          onPress={() => setIsImportant((value) => !value)}
          accessibilityRole="switch"
          accessibilityState={{ checked: isImportant }}
          accessibilityLabel="Indispensable"
          style={styles.switchRow}
        >
          <AisleIcon aisle="important" size={20} />
          <Text style={styles.switchLabel}>Indispensable</Text>
          <Switch
            value={isImportant}
            onValueChange={setIsImportant}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      {/* Sticky footer : les actions restent visibles, au-dessus de la barre de navigation. */}
      <View style={[styles.footer, { paddingBottom: bottomInset + theme.spacing.sm }]}>
        <PrimaryButton
          label="Enregistrer"
          onPress={handleSave}
          isLoading={busy === "saving"}
          isDisabled={busy === "removing"}
        />
        <TextButton
          label="Retirer de la liste"
          variant="danger"
          onPress={handleRemove}
          isDisabled={busy !== null}
        />
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    sheet: { flex: 1 },
    scroll: { flex: 1 },
    content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
    footer: {
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
    fields: { flexDirection: "row", gap: spacing.sm },
    labelField: { flex: 1 },
    quantityField: { width: 104 },
    block: { gap: spacing.sm },
    blockTitle: {
      paddingHorizontal: spacing.xs,
      color: colors.textMuted,
      fontSize: fontSize.small,
      fontWeight: "700",
    },
    // Le rayon en grille d'icônes : trois par ligne, le choisi cerclé de tomate.
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
    cell: {
      width: "31.8%",
      minHeight: 64,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.surface,
      backgroundColor: colors.surface,
    },
    cellSelected: { borderColor: colors.primary, backgroundColor: colors.chipBg },
    pressed: { opacity: 0.6 },
    cellLabel: {
      color: colors.text,
      fontSize: fontSize.caption - 1,
      fontWeight: "600",
      textAlign: "center",
    },
    cellLabelSelected: { color: colors.chipText },
    hint: { paddingHorizontal: spacing.xs, color: colors.textMuted, fontSize: fontSize.caption },
    switchRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    switchLabel: { flex: 1, color: colors.text, fontSize: fontSize.body, fontWeight: "600" },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
