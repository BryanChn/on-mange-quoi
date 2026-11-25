import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { PrimaryButton } from "@/components/primary-button";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { hapticAdded, hapticConfirm, hapticReject } from "@/lib/haptics";
import { shareOrderText } from "@/lib/share-soiree";
import { namesWithoutOrder, orderText, recapPeople, summarizeOrder } from "@/lib/soiree-rules";
import {
  addOrderItem,
  isOrderingClosedError,
  markOrdered,
  ORDER_LABEL_MAX_LENGTH,
  ORDER_MAX_QUANTITY,
  ORDER_NOTE_MAX_LENGTH,
  removeOrderItem,
  setOrderItemQuantity,
  soireeLink,
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
  const [isSharing, setIsSharing] = useState(false);

  const isOpen = soiree.step === "commande";
  const myItems = soiree.items.filter((item) => item.profileId === userId);
  const nameById = new Map(soiree.members.map((member) => [member.id, member.name]));
  const realName = (id: string) => nameById.get(id) ?? "Quelqu’un";
  // « toi » à l'écran seulement : le récap partagé (handleShare) prend les vrais prénoms.
  const summary = summarizeOrder(soiree.items, (id) => (id === userId ? "toi" : realName(id)));
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
      hapticAdded();
      setLabel("");
      setNote("");
      onChanged();
    } catch (addError) {
      fail(addError, "Ta ligne n’a pas été ajoutée : vérifie ta connexion et réessaie.");
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
      fail(writeError, "Ta ligne n’a pas été modifiée : vérifie ta connexion et réessaie.");
    } finally {
      setBusyItemId(null);
    }
  }

  // Le texte est lu par les autres dans WhatsApp : les vrais prénoms, jamais « toi ».
  async function handleShare() {
    setError(null);
    setNotice(null);
    setIsSharing(true);
    try {
      const text = orderText({
        restaurant: soiree.restaurant,
        isOrdered: !isOpen,
        lines: summarizeOrder(soiree.items, realName),
        people: recapPeople(soiree.items, realName),
        waiting,
        joinUrl: soireeLink(soiree.joinToken),
      });
      const outcome = await shareOrderText(text);
      if (outcome === "copied") setNotice("Récap copié, colle-le dans WhatsApp.");
    } catch {
      setError("Le récap n’est pas parti. Réessaie.");
    } finally {
      setIsSharing(false);
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
      setError("La commande n’est pas marquée comme passée : vérifie ta connexion et réessaie.");
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
            ? "Chacun note ce qu’il veut, tout le monde le voit en direct."
            : "C’est commandé ! Le récap reste là jusqu’à demain, puis le repas s’efface tout seul."}
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
                      // « Frites : un de moins » plutôt que « Un Frites de moins » : juste
                      // quel que soit le genre ou le nombre de l'article.
                      label={
                        item.quantity === 1
                          ? `Retirer ${item.label}`
                          : `${item.label} : un de moins`
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
                      label={`${item.label} : un de plus`}
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
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Récap pour le comptoir · {total} article{total > 1 ? "s" : ""}
        </Text>
        <Card>
          {summary.length === 0 ? (
            <Text style={styles.muted}>
              Personne n’a encore commandé.
              {isOpen ? " Ajoute ce que tu prends juste au-dessus." : ""}
            </Text>
          ) : (
            summary.map((line, index) => (
              // Lue d'un bloc par TalkBack : « 3 Kebab, sans oignon : Léa, Tom », pas « 3× »
              // puis l'article puis les noms en trois arrêts.
              <View
                key={index}
                style={styles.summaryLine}
                accessible
                accessibilityLabel={`${line.quantity} ${line.label}${line.note ? `, ${line.note}` : ""} : ${line.people.join(", ")}`}
              >
                <Text style={styles.summaryQuantity}>{line.quantity}×</Text>
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>{line.label}</Text>
                  {/* En pastille : une remarque oubliée au comptoir, c'est un kebab raté. */}
                  {line.note ? <Chip label={line.note} /> : null}
                  <Text style={styles.muted}>{line.people.join(", ")}</Text>
                </View>
              </View>
            ))
          )}
          {isOpen && waiting.length > 0 ? (
            <Text style={styles.waiting}>Pas encore commandé : {waiting.join(", ")}</Text>
          ) : null}
        </Card>
        {/* Hors de la carte, pleine largeur : il se voit. Principal une fois la commande
            passée (c'est ce qui reste à faire), secondaire tant qu'on ajoute des lignes. */}
        {summary.length > 0 ? (
          <PrimaryButton
            label="Partager le récap"
            variant={isOpen ? "secondary" : "primary"}
            onPress={handleShare}
            isLoading={isSharing}
          />
        ) : null}
        {notice ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
      </View>

      {isOpen && isOwner ? (
        isConfirmingOrder ? (
          <Card>
            <Text style={styles.confirmTitle} accessibilityRole="header">
              Tu as passé la commande ?
            </Text>
            <Text style={styles.muted}>
              {waiting.length > 0
                ? `${waiting.join(", ")} n’${waiting.length > 1 ? "ont" : "a"} encore rien choisi. `
                : ""}
              Ensuite, plus personne ne pourra modifier la commande ni rejoindre le repas.
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
            label="J’ai passé la commande"
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
    waiting: { color: colors.textMuted, fontSize: fontSize.small, fontStyle: "italic" },
    error: { color: colors.danger, fontSize: fontSize.small },
    notice: { color: colors.success, fontSize: fontSize.small, textAlign: "center" },
    confirmTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.button },
  });
}
