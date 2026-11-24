import { Feather } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextButton } from "@/components/text-button";
import { TextField } from "@/components/text-field";
import { fetchGroup } from "@/lib/groups";
import { hapticReject, hapticTick, hapticToggle } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import {
  addShoppingItem,
  clearCheckedItems,
  fetchShoppingList,
  removeShoppingItem,
  setShoppingItemChecked,
  subscribeToShoppingList,
  updateShoppingItem,
} from "@/lib/shopping";
import {
  findDuplicate,
  SHOPPING_LABEL_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX_LENGTH,
  sortShoppingList,
  type ShoppingItem,
} from "@/lib/shopping-rules";
import { useTheme, type Theme } from "@/theme";

type ListState = { groupName: string; items: ShoppingItem[]; names: Map<string, string> };

// La liste de courses d'un foyer : ajouter, cocher en magasin (« je l'ai pris »), retirer
// les achetés. Tout le monde la voit bouger en direct.
export default function ShoppingListScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id;

  const [list, setList] = useState<ListState | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ce qui s'est passé sans erreur (« Lait était déjà pris : remis dans À acheter »).
  const [notice, setNotice] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Article en cours de modification (appui long), et ses champs.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  // Coches affichées dès le toucher, avant la réponse du serveur (on coche vite en magasin).
  const [pendingChecks, setPendingChecks] = useState<Map<string, boolean>>(new Map());

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);

  const loadList = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    Promise.all([fetchGroup(groupId), fetchShoppingList(groupId)]).then(
      ([group, items]) => {
        if (latestRequestRef.current !== requestId) return;
        setList({
          groupName: group.name,
          items,
          names: new Map(group.members.map((member) => [member.id, member.name])),
        });
        setHasFailed(false);
      },
      () => {
        if (latestRequestRef.current !== requestId) return;
        setHasFailed(true);
      },
    );
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      loadList();
      return subscribeToShoppingList(groupId, loadList);
    }, [groupId, loadList]),
  );

  if (hasFailed && !list) {
    return (
      <ErrorScreen
        title="On n’arrive pas à ouvrir la liste"
        message="Vérifie ta connexion et réessaie."
        onRetry={loadList}
      />
    );
  }
  if (!list) return <LoadingScreen />;

  // La liste telle qu'affichée : les coches en attente comptent déjà.
  const items = sortShoppingList(
    list.items.map((item) => {
      const pending = pendingChecks.get(item.id);
      if (pending === undefined || pending === (item.checkedAt !== null)) return item;
      return pending
        ? { ...item, checkedAt: new Date().toISOString(), checkedBy: userId ?? null }
        : { ...item, checkedAt: null, checkedBy: null };
    }),
  );
  const toBuy = items.filter((item) => item.checkedAt === null);
  const taken = items.filter((item) => item.checkedAt !== null);

  function nameOf(profileId: string | null): string {
    if (profileId === null) return "quelqu’un";
    if (profileId === userId) return "toi";
    return list?.names.get(profileId) ?? "quelqu’un";
  }

  async function handleAdd() {
    if (label.trim() === "") {
      setLabelError("Écris ce qu’il faut acheter.");
      return;
    }
    setLabelError(null);
    setError(null);
    setNotice(null);

    // Déjà dans la liste : pas de doublon. Déjà pris : on le remet dans « À acheter ».
    const duplicate = findDuplicate(items, label);
    if (duplicate && duplicate.checkedAt === null) {
      hapticReject();
      setLabelError(`« ${duplicate.label} » est déjà dans la liste.`);
      return;
    }

    setIsAdding(true);
    try {
      if (duplicate) {
        await setShoppingItemChecked(duplicate.id, false);
        setNotice(`« ${duplicate.label} » était déjà pris : remis dans « À acheter ».`);
      } else {
        await addShoppingItem(groupId, { label, quantity });
      }
      setLabel("");
      setQuantity("");
      loadList();
    } catch {
      hapticReject();
      setError("L’article n’a pas été ajouté : vérifie ta connexion et réessaie.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(item: ShoppingItem) {
    const checked = item.checkedAt === null;
    hapticToggle(checked);
    setError(null);
    setPendingChecks((current) => new Map(current).set(item.id, checked));
    try {
      await setShoppingItemChecked(item.id, checked);
      loadList();
    } catch {
      hapticReject();
      setError("La coche n’est pas passée : vérifie ta connexion et réessaie.");
    } finally {
      // Le rechargement (ou l'échec) fait foi : la coche en attente n'a plus lieu d'être.
      setPendingChecks((current) => {
        const next = new Map(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  function startEdit(item: ShoppingItem) {
    hapticTick();
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditQuantity(item.quantity ?? "");
    setEditError(null);
  }

  async function handleSaveEdit(item: ShoppingItem) {
    if (editLabel.trim() === "") {
      setEditError("Écris le nom de l’article.");
      return;
    }
    const duplicate = findDuplicate(items, editLabel, item.id);
    if (duplicate) {
      setEditError(`« ${duplicate.label} » est déjà dans la liste.`);
      return;
    }
    setIsSavingEdit(true);
    try {
      await updateShoppingItem(item.id, { label: editLabel, quantity: editQuantity });
      setEditingId(null);
      loadList();
    } catch {
      hapticReject();
      setEditError("L’article n’a pas été modifié : vérifie ta connexion et réessaie.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleRemove(item: ShoppingItem) {
    setError(null);
    try {
      await removeShoppingItem(item.id);
      loadList();
    } catch {
      hapticReject();
      setError("L’article n’a pas été retiré : vérifie ta connexion et réessaie.");
    }
  }

  async function handleClear() {
    setError(null);
    setIsClearing(true);
    try {
      await clearCheckedItems(groupId);
      loadList();
    } catch {
      hapticReject();
      setError("Les achetés n’ont pas été retirés : vérifie ta connexion et réessaie.");
    } finally {
      setIsClearing(false);
    }
  }

  function renderItem(item: ShoppingItem) {
    if (item.id === editingId) {
      return (
        <View key={item.id} style={styles.editRow}>
          <View style={styles.form}>
            <View style={styles.labelField}>
              <TextField
                label="Article"
                value={editLabel}
                onChangeText={setEditLabel}
                error={editError}
                autoCapitalize="sentences"
                autoFocus
                maxLength={SHOPPING_LABEL_MAX_LENGTH}
                editable={!isSavingEdit}
                onSubmitEditing={() => handleSaveEdit(item)}
              />
            </View>
            <View style={styles.quantityField}>
              <TextField
                label="Combien"
                value={editQuantity}
                onChangeText={setEditQuantity}
                maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
                editable={!isSavingEdit}
                onSubmitEditing={() => handleSaveEdit(item)}
              />
            </View>
          </View>
          <PrimaryButton
            label="Enregistrer"
            variant="secondary"
            onPress={() => handleSaveEdit(item)}
            isLoading={isSavingEdit}
          />
          <TextButton
            label="Annuler"
            onPress={() => setEditingId(null)}
            isDisabled={isSavingEdit}
          />
        </View>
      );
    }

    const isTaken = item.checkedAt !== null;
    const description = item.quantity ? `${item.label}, ${item.quantity}` : item.label;
    return (
      <View key={item.id} style={styles.row}>
        <Pressable
          onPress={() => handleToggle(item)}
          // Toucher coche (le geste du magasin) ; appui long modifie, plus rare.
          onLongPress={() => startEdit(item)}
          accessibilityActions={[{ name: "edit", label: "Modifier" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "edit") startEdit(item);
          }}
          accessibilityRole="checkbox"
          accessibilityLabel={description}
          accessibilityState={{ checked: isTaken }}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
        >
          <View style={[styles.checkbox, isTaken && styles.checkboxChecked]}>
            {isTaken ? <Feather name="check" size={18} color={theme.colors.onPrimary} /> : null}
          </View>
          <View style={styles.itemText}>
            <Text style={[styles.itemLabel, isTaken && styles.itemTaken]}>
              {item.label}
              {item.quantity ? <Text style={styles.quantity}> · {item.quantity}</Text> : null}
            </Text>
            {isTaken ? <Text style={styles.muted}>Pris par {nameOf(item.checkedBy)}</Text> : null}
          </View>
        </Pressable>
        <Pressable
          onPress={() => handleRemove(item)}
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${item.label} de la liste`}
          hitSlop={4}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Feather name="x" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
      // Clavier ouvert : « Ajouter » marche du premier toucher, et le clavier reste ouvert
      // pour enchaîner les articles.
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: list.groupName }} />
      <Text style={styles.title} accessibilityRole="header">
        Liste de courses
      </Text>

      <Card>
        <View style={styles.form}>
          <View style={styles.labelField}>
            <TextField
              label="Il faut acheter"
              value={label}
              onChangeText={setLabel}
              error={labelError}
              placeholder="Lait"
              autoCapitalize="sentences"
              maxLength={SHOPPING_LABEL_MAX_LENGTH}
              editable={!isAdding}
              onSubmitEditing={handleAdd}
            />
          </View>
          <View style={styles.quantityField}>
            <TextField
              label="Combien"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="2"
              maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
              editable={!isAdding}
              onSubmitEditing={handleAdd}
            />
          </View>
        </View>
        <PrimaryButton label="Ajouter" onPress={handleAdd} isLoading={isAdding} />
        <Text style={styles.hint}>Appui long sur un article pour le modifier.</Text>
      </Card>

      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          À acheter · {toBuy.length}
        </Text>
        <Card>
          {toBuy.length === 0 ? (
            <Text style={styles.muted}>
              {taken.length === 0
                ? "La liste est vide. Ajoute ce qui manque à la maison."
                : "Tout est pris, bravo !"}
            </Text>
          ) : (
            toBuy.map(renderItem)
          )}
        </Card>
      </View>

      {taken.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Déjà pris · {taken.length}
          </Text>
          <Card>{taken.map(renderItem)}</Card>
          <TextButton
            label={taken.length > 1 ? `Retirer les ${taken.length} achetés` : "Retirer l’acheté"}
            onPress={handleClear}
            isDisabled={isClearing}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { padding: spacing.xl, gap: spacing.xl },
    title: { color: colors.text, fontFamily: fonts.display, fontSize: fontSize.screenTitle },
    form: { flexDirection: "row", gap: spacing.md },
    labelField: { flex: 1 },
    quantityField: { width: 104 },
    section: { gap: spacing.md },
    sectionTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    // Toute la ligne coche : une grande cible, pratique d'une main dans le magasin.
    rowMain: {
      flex: 1,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    checkbox: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    itemText: { flex: 1, minWidth: 0, gap: 2 },
    itemLabel: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    itemTaken: { color: colors.textMuted, textDecorationLine: "line-through" },
    quantity: { color: colors.textMuted, fontWeight: "400" },
    muted: { color: colors.textMuted, fontSize: fontSize.small },
    // 44 : taille minimale d'une zone tactile.
    remove: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: { opacity: 0.6 },
    error: { color: colors.danger, fontSize: fontSize.small },
    notice: { color: colors.success, fontSize: fontSize.small },
    hint: { color: colors.textMuted, fontSize: fontSize.caption, textAlign: "center" },
    editRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  });
}
