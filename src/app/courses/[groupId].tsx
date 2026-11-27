import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/avatar";
import { ShoppingTripCard } from "@/components/shopping-trip-card";
import { Section } from "@/components/section";
import { SignatureCard } from "@/components/signature-card";
import { SignatureCat } from "@/components/signature-cat";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { TextField } from "@/components/text-field";
import { fetchGroup } from "@/lib/groups";
import {
  hapticAdded,
  hapticConfirm,
  hapticLongPress,
  hapticReject,
  hapticTick,
  hapticToggle,
} from "@/lib/haptics";
import type { Member } from "@/lib/members";
import {
  checkEntering,
  colorTransition,
  dishEntering,
  dishExiting,
  dishLayout,
} from "@/lib/motion";
import { useSession } from "@/lib/session";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import {
  addShoppingItem,
  clearCheckedItems,
  endShoppingTrip,
  fetchActiveTrips,
  fetchShoppingHistory,
  fetchShoppingList,
  removeShoppingItem,
  setShoppingItemChecked,
  startShoppingTrip,
  subscribeToShoppingList,
  updateShoppingItem,
  type ShoppingTrip,
} from "@/lib/shopping";
import {
  buildSuggestions,
  findDuplicate,
  SHOPPING_LABEL_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX_LENGTH,
  sortShoppingList,
  type ShoppingHistoryEntry,
  type ShoppingItem,
  type ShoppingSuggestion,
} from "@/lib/shopping-rules";
import { useTheme, type Theme } from "@/theme";

type ListState = {
  groupName: string;
  items: ShoppingItem[];
  history: ShoppingHistoryEntry[];
  members: Map<string, Member>;
  // Qui est aux courses en ce moment (« Je pars faire les courses »).
  trips: ShoppingTrip[];
};

// La liste de courses d'un foyer (maquette du 24/11 : https://claude.ai/artifact/TbwTRnDRkExZVUx6rupwNC).
// Carte signature avec la progression, ajout sur une ligne, « Souvent acheté », puis la liste :
// un toucher coche (le geste du magasin), un appui long ouvre l'article sur place pour le
// corriger ou le retirer. Tout le monde la voit bouger en direct.
export default function ShoppingListScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id;

  const [list, setList] = useState<ListState | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // Pourquoi le chargement a échoué : le message dit la vraie cause.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ce qui s'est passé sans erreur (« Lait était déjà pris : remis dans À acheter »).
  const [notice, setNotice] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isTripBusy, setIsTripBusy] = useState(false);
  // Article ouvert par un appui long, et ses champs.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // Suggestion en cours d'ajout : pas de double ajout sur un double toucher.
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  // Coches affichées dès le toucher, avant la réponse du serveur (on coche vite en magasin).
  const [pendingChecks, setPendingChecks] = useState<Map<string, boolean>>(new Map());

  // Numéro du dernier chargement lancé : seule sa réponse a le droit de modifier l'écran.
  const latestRequestRef = useRef(0);

  const loadList = useCallback(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    Promise.all([
      fetchGroup(groupId),
      fetchShoppingList(groupId),
      fetchShoppingHistory(groupId),
      fetchActiveTrips(groupId),
    ]).then(
      ([group, items, history, trips]) => {
        if (latestRequestRef.current !== requestId) return;
        setList({
          groupName: group.name,
          items,
          history,
          members: new Map(group.members.map((member) => [member.id, member])),
          trips,
        });
        setHasFailed(false);
      },
      (error: unknown) => {
        if (latestRequestRef.current !== requestId) return;
        setLoadError(error);
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
        message={loadErrorMessage(loadError)}
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
  const suggestions = buildSuggestions(list.history, items);
  const toBuy = items.filter((item) => item.checkedAt === null);
  const taken = items.filter((item) => item.checkedAt !== null);
  const total = items.length;

  const summary =
    total === 0
      ? "Rien à acheter pour l’instant"
      : toBuy.length === 0
        ? "Tout est pris, bravo !"
        : `${toBuy.length} à acheter${taken.length > 0 ? ` · ${taken.length} déjà pris` : ""}`;

  function nameOf(profileId: string | null): string {
    if (profileId === null) return "quelqu’un";
    if (profileId === userId) return "toi";
    return list?.members.get(profileId)?.name ?? "quelqu’un";
  }

  async function handleStartTrip() {
    setError(null);
    setNotice(null);
    setIsTripBusy(true);
    try {
      const { isAnnounced } = await startShoppingTrip(groupId);
      hapticConfirm();
      // La nuit, ou un départ déjà annoncé il y a peu : le foyer n'est pas prévenu une fois de
      // plus, mais les ajouts arrivent quand même.
      setNotice(
        isAnnounced
          ? "Le foyer est prévenu. Ce qu’ils ajoutent t’arrive pendant 1 h."
          : "Ce que le foyer ajoute t’arrive pendant 1 h.",
      );
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("Le départ n’est pas passé", error));
    } finally {
      setIsTripBusy(false);
    }
  }

  async function handleEndTrip() {
    setError(null);
    setNotice(null);
    setIsTripBusy(true);
    try {
      await endShoppingTrip(groupId);
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("Ce n’est pas passé", error));
    } finally {
      setIsTripBusy(false);
    }
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
      hapticAdded();
      setLabel("");
      setQuantity("");
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été ajouté", error));
    } finally {
      setIsAdding(false);
    }
  }

  // « Souvent acheté » : un toucher remet l'article dans la liste, avec sa dernière quantité.
  async function handleAddSuggestion(suggestion: ShoppingSuggestion) {
    setError(null);
    setNotice(null);
    setAddingSuggestion(suggestion.label);
    try {
      await addShoppingItem(groupId, {
        label: suggestion.label,
        quantity: suggestion.quantity ?? "",
      });
      hapticAdded();
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été ajouté", error));
    } finally {
      setAddingSuggestion(null);
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
    } catch (error) {
      hapticReject();
      setError(failureMessage("La coche n’est pas passée", error));
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
    } catch (error) {
      hapticReject();
      setEditError(failureMessage("L’article n’a pas été modifié", error));
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleRemove(item: ShoppingItem) {
    setError(null);
    try {
      await removeShoppingItem(item.id);
      setEditingId(null);
      loadList();
    } catch (error) {
      hapticReject();
      setEditError(failureMessage("L’article n’a pas été retiré", error));
    }
  }

  async function handleClear() {
    setError(null);
    setIsClearing(true);
    try {
      await clearCheckedItems(groupId);
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("Les achetés n’ont pas été retirés", error));
    } finally {
      setIsClearing(false);
    }
  }

  function renderEditPanel(item: ShoppingItem) {
    return (
      <View style={styles.editPanel}>
        <View style={styles.editFields}>
          <View style={styles.editLabelField}>
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
          <View style={styles.editQuantityField}>
            <TextField
              label="Quantité"
              value={editQuantity}
              onChangeText={setEditQuantity}
              maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
              editable={!isSavingEdit}
              onSubmitEditing={() => handleSaveEdit(item)}
            />
          </View>
        </View>
        <View style={styles.editActions}>
          <Pressable
            onPress={() => handleRemove(item)}
            disabled={isSavingEdit}
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${item.label} de la liste`}
            style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={18} color={theme.colors.danger} />
            <Text style={styles.removeText}>Retirer</Text>
          </Pressable>
          <View style={styles.spacer} />
          <Pressable
            onPress={() => setEditingId(null)}
            disabled={isSavingEdit}
            accessibilityRole="button"
            style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
          <Pressable
            onPress={() => handleSaveEdit(item)}
            disabled={isSavingEdit}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer"
            accessibilityState={{ busy: isSavingEdit }}
            style={({ pressed }) => [styles.okButton, pressed && styles.pressed]}
          >
            {isSavingEdit ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <Text style={styles.okText}>OK</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  function renderItem(item: ShoppingItem, index: number) {
    const isTaken = item.checkedAt !== null;
    const description = item.quantity ? `${item.label}, ${item.quantity}` : item.label;
    const checker = item.checkedBy ? list?.members.get(item.checkedBy) : undefined;

    return (
      <Animated.View
        key={item.id}
        entering={dishEntering}
        exiting={dishExiting}
        layout={dishLayout}
        style={index > 0 && styles.separated}
      >
        {item.id === editingId ? (
          renderEditPanel(item)
        ) : (
          <Pressable
            onPress={() => handleToggle(item)}
            // Toucher coche (le geste du magasin) ; appui long ouvre l'article, plus rare.
            onLongPress={() => {
              hapticLongPress();
              startEdit(item);
            }}
            accessibilityRole="checkbox"
            accessibilityLabel={description}
            accessibilityState={{ checked: isTaken }}
            accessibilityActions={[{ name: "edit", label: "Modifier ou retirer" }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "edit") startEdit(item);
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Animated.View
              style={[styles.checkbox, colorTransition, isTaken && styles.checkboxChecked]}
            >
              {isTaken ? (
                <Animated.View entering={checkEntering}>
                  <Feather name="check" size={16} color={theme.colors.onPrimary} />
                </Animated.View>
              ) : null}
            </Animated.View>
            <View style={styles.itemText}>
              <Text style={[styles.itemLabel, isTaken && styles.itemTaken]} numberOfLines={2}>
                {item.label}
              </Text>
              {isTaken ? (
                <View style={styles.takenBy}>
                  <Avatar
                    name={nameOf(item.checkedBy)}
                    avatar={checker?.avatar ?? null}
                    photoPath={checker?.photoPath ?? null}
                    size={18}
                  />
                  <Text style={styles.takenByText}>Pris par {nameOf(item.checkedBy)}</Text>
                </View>
              ) : null}
            </View>
            {item.quantity ? (
              <View style={[styles.quantityChip, isTaken && styles.quantityChipTaken]}>
                <Text style={[styles.quantityText, isTaken && styles.quantityTextTaken]}>
                  {item.quantity}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}
      </Animated.View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
      // Clavier ouvert : « + » marche du premier toucher, et le clavier reste ouvert pour
      // enchaîner les articles.
      keyboardShouldPersistTaps="handled"
    >
      <SignatureCard>
        <View style={styles.signatureTop}>
          <View style={styles.signatureText}>
            <Text style={styles.signatureGroup}>{list.groupName}</Text>
            <Text style={styles.signatureTitle} accessibilityRole="header">
              Les courses
            </Text>
            <Text style={styles.signatureSummary}>{summary}</Text>
          </View>
          <SignatureCat size={64} />
        </View>
        {total > 0 ? (
          <View
            style={styles.progressTrack}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${taken.length} pris sur ${total}`}
            accessibilityValue={{ min: 0, max: total, now: taken.length }}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round((taken.length / total) * 100)}%` },
              ]}
            />
          </View>
        ) : null}
      </SignatureCard>

      <ShoppingTripCard
        trips={list.trips}
        userId={userId}
        nameOf={(profileId) => list.members.get(profileId)?.name ?? "Quelqu’un"}
        canStart={list.members.size >= 2}
        isBusy={isTripBusy}
        onStart={handleStartTrip}
        onEnd={handleEndTrip}
      />

      <View style={styles.addBlock}>
        <View style={styles.composer}>
          <View style={[styles.composerField, labelError !== null && styles.composerFieldError]}>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Ajouter un article…"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Article à ajouter"
              autoCapitalize="sentences"
              maxLength={SHOPPING_LABEL_MAX_LENGTH}
              editable={!isAdding}
              onSubmitEditing={handleAdd}
              style={styles.composerInput}
            />
            <View style={styles.composerDivider} />
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Qté"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Quantité, facultatif"
              maxLength={SHOPPING_QUANTITY_MAX_LENGTH}
              editable={!isAdding}
              onSubmitEditing={handleAdd}
              style={styles.composerQuantity}
            />
          </View>
          <Pressable
            onPress={handleAdd}
            disabled={isAdding}
            accessibilityRole="button"
            accessibilityLabel="Ajouter"
            accessibilityState={{ busy: isAdding }}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            {isAdding ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <Feather name="plus" size={24} color={theme.colors.onPrimary} />
            )}
          </Pressable>
        </View>
        {labelError ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {labelError}
          </Text>
        ) : null}

        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsTitle}>Souvent acheté</Text>
            <View style={styles.suggestionList}>
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.label}
                  onPress={() => handleAddSuggestion(suggestion)}
                  disabled={addingSuggestion !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${suggestion.label}${suggestion.quantity ? `, ${suggestion.quantity}` : ""}`}
                  style={({ pressed }) => [
                    styles.suggestion,
                    (pressed || addingSuggestion === suggestion.label) && styles.pressed,
                  ]}
                >
                  <Feather name="plus" size={16} color={theme.colors.primary} />
                  <Text style={styles.suggestionText}>
                    {suggestion.label}
                    {suggestion.quantity ? ` · ${suggestion.quantity}` : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>

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

      {/* Pas d'animation d'entrée au premier affichage : seulement quand la liste bouge. */}
      <LayoutAnimationConfig skipEntering>
        <Section title={`À acheter · ${toBuy.length}`}>
          <View style={styles.listCard}>
            {toBuy.length === 0 ? (
              <Text style={styles.empty}>
                {taken.length === 0
                  ? "La liste est vide. Ajoute ce qui manque à la maison."
                  : "Tout est pris, bravo !"}
              </Text>
            ) : (
              toBuy.map(renderItem)
            )}
          </View>
        </Section>

        {taken.length > 0 ? (
          <Section
            title={`Déjà pris · ${taken.length}`}
            action={{
              label: taken.length > 1 ? `Retirer les ${taken.length} achetés` : "Retirer l’acheté",
              onPress: () => {
                if (!isClearing) handleClear();
              },
            }}
          >
            <View style={styles.listCard}>{taken.map(renderItem)}</View>
          </Section>
        ) : null}
      </LayoutAnimationConfig>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, control, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    container: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.xl },

    // Carte signature : groupe, titre, où on en est, le chat, la progression.
    signatureTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    signatureText: { flex: 1, gap: spacing.xs },
    signatureGroup: { color: colors.onSignatureMuted, fontSize: fontSize.small, fontWeight: "700" },
    signatureTitle: {
      color: colors.onSignature,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    signatureSummary: { color: colors.onSignatureMuted, fontSize: fontSize.small },
    progressTrack: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.signatureTrack,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: radius.pill,
      backgroundColor: colors.signatureButton,
    },

    // Ajout sur une ligne : le champ en pilule et le bouton rond.
    addBlock: { gap: spacing.md },
    composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    composerField: {
      flex: 1,
      minWidth: 0,
      height: control.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingLeft: 18,
      paddingRight: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.surface,
    },
    composerFieldError: { borderColor: colors.danger },
    composerInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: fontSize.body },
    composerDivider: { width: 1, height: 24, backgroundColor: colors.border },
    composerQuantity: { width: 52, color: colors.text, fontSize: fontSize.body },
    addButton: {
      width: control.lg,
      height: control.lg,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },

    suggestions: { gap: spacing.sm },
    suggestionsTitle: { color: colors.textMuted, fontSize: fontSize.caption, fontWeight: "700" },
    suggestionList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    // 44 de haut : une cible facile, même en marchant dans le magasin.
    suggestion: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: colors.surface2,
    },
    suggestionText: { color: colors.text, fontSize: fontSize.small, fontWeight: "700" },

    listCard: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
    separated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    empty: { color: colors.textMuted, fontSize: fontSize.small, paddingVertical: spacing.lg },

    // Une ligne : toute la ligne coche, une grande cible d'une main dans le magasin.
    row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 14 },
    checkbox: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    itemText: { flex: 1, minWidth: 0, gap: 3, paddingVertical: spacing.sm },
    itemLabel: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    itemTaken: { color: colors.textMuted, textDecorationLine: "line-through" },
    takenBy: { flexDirection: "row", alignItems: "center", gap: 6 },
    takenByText: { color: colors.textMuted, fontSize: fontSize.caption },
    quantityChip: {
      paddingVertical: 5,
      paddingHorizontal: 11,
      borderRadius: radius.pill,
      backgroundColor: colors.chipBg,
    },
    quantityChipTaken: { backgroundColor: colors.surface2 },
    quantityText: { color: colors.chipText, fontSize: fontSize.small, fontWeight: "700" },
    quantityTextTaken: { color: colors.textMuted },

    // L'article ouvert par un appui long : corriger ou retirer, sur place.
    editPanel: {
      marginVertical: spacing.xs,
      marginHorizontal: -spacing.sm,
      padding: 14,
      gap: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
    },
    editFields: { flexDirection: "row", gap: spacing.sm },
    editLabelField: { flex: 1 },
    editQuantityField: { width: 96 },
    editActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    textAction: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.sm,
    },
    removeText: { color: colors.danger, fontSize: fontSize.small, fontWeight: "700" },
    cancelText: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "700" },
    spacer: { flex: 1 },
    okButton: {
      minWidth: 64,
      height: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    okText: { color: colors.onPrimary, fontSize: fontSize.button, fontWeight: "600" },

    pressed: { opacity: 0.6 },
    error: { color: colors.danger, fontSize: fontSize.small },
    notice: { color: colors.success, fontSize: fontSize.small },
  });
}
