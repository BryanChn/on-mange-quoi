import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { hapticConfirm, hapticReject } from "@/lib/haptics";
import { shareOrderText } from "@/lib/share-soiree";
import { namesWithoutOrder, orderText, summarizeOrder } from "@/lib/soiree-rules";
import {
  addOrderItem,
  isOrderingClosedError,
  markOrdered,
  ORDER_LABEL_MAX_LENGTH,
  ORDER_MAX_QUANTITY,
  ORDER_NOTE_MAX_LENGTH,
  removeOrderItem,
  setOrderItemQuantity,
  type OrderItem,
  type SoireeDetail,
} from "@/lib/soirees";
import { useTheme, type Theme } from "@/theme";

type SoireeOrderProps = {
  soiree: SoireeDetail;
  userId: string | undefined;
  isOwner: boolean;
  // Après chaque écriture : l'écran recharge la soirée (et le temps réel prévient les autres).
  onChanged: () => void;
};

// La commande d'une soirée (étapes « commande » et « passée ») : ce que je prends, le
// récapitulatif pour le comptoir, et « Commande passée » pour le responsable.
export function SoireeOrder({ soiree, userId, isOwner, onChanged }: SoireeOrderProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);

  const isOpen = soiree.step === "commande";
  const myItems = soiree.items.filter((item) => item.profileId === userId);
  const nameById = new Map(soiree.members.map((member) => [member.id, member.name]));
  const summary = summarizeOrder(soiree.items, (id) =>
    id === userId ? "toi" : (nameById.get(id) ?? "Quelqu’un"),
  );
  const waiting = namesWithoutOrder(soiree.members, soiree.items);
  const total = soiree.items.reduce((sum, item) => sum + item.quantity, 0);

  // Commande figée entre-temps (« Commande passée ») : pas une panne, on recharge.
  function fail(writeError: unknown, message: string) {
    hapticReject();
    if (isOrderingClosedError(writeError)) {
      onChanged();
    } else {
      setError(message);
    }
  }

  async function handleAdd() {
    const cleanLabel = label.trim();
    if (cleanLabel === "") {
      setError("Écris ce que tu prends.");
      return;
    }
    setError(null);
    setIsAdding(true);
    try {
      await addOrderItem(soiree.id, { label: cleanLabel, note });
      setLabel("");
      setNote("");
      onChanged();
    } catch (addError) {
      fail(addError, "Impossible d’ajouter ta ligne. Vérifie ton réseau et réessaie.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleQuantity(item: OrderItem, quantity: number) {
    setError(null);
    setBusyItemId(item.id);
    try {
      if (quantity < 1) {
        await removeOrderItem(item.id);
      } else {
        await setOrderItemQuantity(item.id, quantity);
      }
      onChanged();
    } catch (writeError) {
      fail(writeError, "Impossible de modifier ta ligne. Vérifie ton réseau et réessaie.");
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleShare() {
    setError(null);
    setNotice(null);
    try {
      const outcome = await shareOrderText(orderText(soiree.restaurant, summary));
      if (outcome === "copied") setNotice("Récap copié.");
    } catch {
      setError("Impossible de partager le récap. Réessaie.");
    }
  }

  async function handleMarkOrdered() {
    setError(null);
    setIsOrdering(true);
    try {
      await markOrdered(soiree.id);
      hapticConfirm();
      setIsConfirmingOrder(false);
      onChanged();
    } catch {
      setError("Impossible de marquer la commande comme passée. Vérifie ton réseau et réessaie.");
    } finally {
      setIsOrdering(false);
    }
  }

  return (
    <View style={styles.container}>
      <Card>
        <Chip label={isOpen ? "Commande ouverte" : "Commande passée"} hasDot={isOpen} />
        <Text style={styles.cardTitle}>{soiree.restaurant}</Text>
        <Text style={styles.muted}>
          {isOpen
            ? "Chacun écrit ce qu’il prend. Tout le monde voit tout, en direct."
            : "Tout est figé. La soirée reste lisible 24 h, puis elle est effacée."}
        </Text>
      </Card>

      {isOpen ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Ta commande
          </Text>
          {myItems.length > 0 ? (
            <Card>
              {myItems.map((item) => (
                <View key={item.id} style={styles.myItem}>
                  <View style={styles.itemText}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    {item.note ? <Text style={styles.muted}>{item.note}</Text> : null}
                  </View>
                  <View style={styles.stepper}>
                    <StepButton
                      icon={item.quantity === 1 ? "trash-2" : "minus"}
                      label={
                        item.quantity === 1 ? `Retirer ${item.label}` : `Un ${item.label} de moins`
                      }
                      onPress={() => handleQuantity(item, item.quantity - 1)}
                      isDisabled={busyItemId === item.id}
                      styles={styles}
                      color={theme.colors.text}
                    />
                    <Text style={styles.quantity} accessibilityLabel={`Quantité ${item.quantity}`}>
                      {item.quantity}
                    </Text>
                    <StepButton
                      icon="plus"
                      label={`Un ${item.label} de plus`}
                      onPress={() => handleQuantity(item, item.quantity + 1)}
                      isDisabled={busyItemId === item.id || item.quantity >= ORDER_MAX_QUANTITY}
                      styles={styles}
                      color={theme.colors.text}
                    />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          <Card>
            <TextField
              label={myItems.length > 0 ? "Autre chose ?" : "Ce que tu prends"}
              value={label}
              onChangeText={setLabel}
              placeholder="Kebab sauce blanche"
              autoCapitalize="sentences"
              maxLength={ORDER_LABEL_MAX_LENGTH}
              editable={!isAdding}
              onSubmitEditing={handleAdd}
            />
            <TextField
              label="Remarque (facultatif)"
              value={note}
              onChangeText={setNote}
              placeholder="Sans oignon"
              autoCapitalize="sentences"
              maxLength={ORDER_NOTE_MAX_LENGTH}
              editable={!isAdding}
              onSubmitEditing={handleAdd}
            />
            <PrimaryButton label="Ajouter" onPress={handleAdd} isLoading={isAdding} />
          </Card>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Récap pour le comptoir · {total} article{total > 1 ? "s" : ""}
        </Text>
        <Card>
          {summary.length === 0 ? (
            <Text style={styles.muted}>Personne n’a encore commandé.</Text>
          ) : (
            summary.map((line, index) => (
              <View key={index} style={styles.summaryLine}>
                <Text style={styles.summaryQuantity}>{line.quantity}×</Text>
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>
                    {line.label}
                    {line.note ? <Text style={styles.summaryNote}> · {line.note}</Text> : null}
                  </Text>
                  <Text style={styles.muted}>{line.people.join(", ")}</Text>
                </View>
              </View>
            ))
          )}
          {isOpen && waiting.length > 0 ? (
            <Text style={styles.waiting}>Pas encore commandé : {waiting.join(", ")}</Text>
          ) : null}
          {summary.length > 0 ? (
            <TextButton label="Partager le récap" onPress={handleShare} />
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </Card>
      </View>

      {isOpen && isOwner ? (
        isConfirmingOrder ? (
          <Card>
            <Text style={styles.confirmTitle} accessibilityRole="header">
              La commande est passée ?
            </Text>
            <Text style={styles.muted}>
              {waiting.length > 0
                ? `${waiting.join(", ")} n’${waiting.length > 1 ? "ont" : "a"} rien commandé. `
                : ""}
              Plus personne ne pourra modifier la commande, ni rejoindre la soirée.
            </Text>
            <PrimaryButton
              label="Oui, c’est commandé"
              onPress={handleMarkOrdered}
              isLoading={isOrdering}
            />
            <TextButton
              label="Annuler"
              onPress={() => setIsConfirmingOrder(false)}
              isDisabled={isOrdering}
            />
          </Card>
        ) : (
          <PrimaryButton
            label="Commande passée"
            variant="secondary"
            onPress={() => setIsConfirmingOrder(true)}
            isDisabled={summary.length === 0}
          />
        )
      ) : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  isDisabled,
  styles,
  color,
}: {
  icon: "minus" | "plus" | "trash-2";
  label: string;
  onPress: () => void;
  isDisabled: boolean;
  styles: ReturnType<typeof createStyles>;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.stepButton, (pressed || isDisabled) && styles.dimmed]}
    >
      <Feather name={icon} size={18} color={color} />
    </Pressable>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { gap: spacing.xl },
    section: { gap: spacing.md },
    sectionTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    cardTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.heading,
      lineHeight: 30,
    },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    myItem: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    itemText: { flex: 1, minWidth: 0, gap: 2 },
    itemLabel: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    stepButton: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      backgroundColor: colors.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    dimmed: { opacity: 0.5 },
    quantity: {
      minWidth: 22,
      textAlign: "center",
      color: colors.text,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.button,
      fontVariant: ["tabular-nums"],
    },
    summaryLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    summaryQuantity: {
      minWidth: 34,
      color: colors.primary,
      fontFamily: fonts.displayBold,
      fontSize: fontSize.button,
      fontVariant: ["tabular-nums"],
    },
    summaryNote: { color: colors.primary, fontWeight: "700" },
    waiting: { color: colors.textMuted, fontSize: fontSize.small, fontStyle: "italic" },
    error: { color: colors.danger, fontSize: fontSize.small },
    notice: { color: colors.success, fontSize: fontSize.small, textAlign: "center" },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
