import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { CollapsingRow } from "@/components/collapsing-row";
import { HeaderButton } from "@/components/header-button";
import { ProgressRing } from "@/components/progress-ring";
import { SegmentedControl } from "@/components/segmented-control";
import { SectionHeader } from "@/components/section";
import { ShoppingTripCard } from "@/components/shopping-trip-card";
import { SignatureCat } from "@/components/signature-cat";
import { StrikeLabel } from "@/components/strike-label";
import { TextButton } from "@/components/text-button";
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
import { checkEntering, colorTransition, countBump, ROW_SETTLE_DELAY_MS } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import {
  addShoppingItem,
  clearCheckedItems,
  endShoppingTrip,
  fetchActiveTrips,
  fetchAisleSettings,
  setShoppingItemImportant,
  type AisleSettings,
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
  AISLE_LABELS,
  buildSuggestions,
  groupShoppingItems,
  findDuplicate,
  SHOPPING_LABEL_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX_LENGTH,
  sortShoppingList,
  splitShoppingList,
  tripToShow,
  type ShoppingSection,
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
  // Les rayons retenus par le foyer et leur ordre.
  aisles: AisleSettings;
};

// La liste de courses d'un foyer (refonte du 27/11, option A :
// https://claude.ai/artifact/YPfGj11em5YcWXtLSsjtrW). Grand titre et anneau de progression,
// la liste « À acheter », « Déjà pris » replié en accordéon, et l'ajout en bas, sous le pouce.
// Un toucher coche sur place (le nom se barre), puis la ligne se replie ; un appui long ouvre
// l'article pour le corriger ou le retirer. Tout le monde la voit bouger en direct.
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
  // Un article qui vient d'arriver dans « Autres » : on propose de le ranger tout de suite.
  const [unsortedItem, setUnsortedItem] = useState<ShoppingItem | null>(null);
  // Par rayon (le magasin) ou par ajout (l'ordre où on a rempli la liste).
  const [sortMode, setSortMode] = useState<"aisle" | "added">("aisle");
  // Étoiles affichées dès le toucher ; même règle que les coches en attente.
  const [pendingStars, setPendingStars] = useState<
    Map<string, { important: boolean; confirmedFor: number | null }>
  >(new Map());
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
  // confirmedFor : le numéro du rechargement lancé après la confirmation du serveur. La coche
  // en attente ne s'efface qu'à l'arrivée de ce rechargement (ou d'un plus récent) : avant, la
  // liste affichée date d'avant la coche, et l'article revenait un instant à son état d'avant.
  const [pendingChecks, setPendingChecks] = useState<
    Map<string, { checked: boolean; confirmedFor: number | null }>
  >(new Map());
  // Les articles tout juste cochés ou décochés, retenus dans leur section d'avant pendant le
  // temps de pose (chacun le sien) : la ligne ne part pas sous le doigt.
  const [held, setHeld] = useState<Map<string, ShoppingSection>>(new Map());
  // Ceux dont le temps de pose est écoulé : leur ligne se replie, puis ils changent de section.
  const [settling, setSettling] = useState<Set<string>>(new Set());
  const settleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // « Déjà pris » replié par défaut : l'écran reste court en magasin.
  const [isTakenOpen, setIsTakenOpen] = useState(false);
  const headerHeight = useHeaderHeight();

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
      fetchAisleSettings(groupId),
    ]).then(
      ([group, items, history, trips, aisles]) => {
        if (latestRequestRef.current !== requestId) return;
        setList({
          groupName: group.name,
          items,
          history,
          members: new Map(group.members.map((member) => [member.id, member])),
          trips,
          aisles,
        });
        setPendingStars((current) => {
          const done = [...current].filter(
            ([, pending]) => pending.confirmedFor !== null && requestId >= pending.confirmedFor,
          );
          if (done.length === 0) return current;
          const next = new Map(current);
          for (const [id] of done) next.delete(id);
          return next;
        });
        // Ce rechargement suit la confirmation de ces coches : la liste fait foi.
        setPendingChecks((current) => {
          const done = [...current].filter(
            ([, pending]) => pending.confirmedFor !== null && requestId >= pending.confirmedFor,
          );
          if (done.length === 0) return current;
          const next = new Map(current);
          for (const [id] of done) next.delete(id);
          return next;
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
      const star = pendingStars.get(item.id)?.important;
      if (star !== undefined && star !== item.isImportant) item = { ...item, isImportant: star };
      const pending = pendingChecks.get(item.id)?.checked;
      if (pending === undefined || pending === (item.checkedAt !== null)) return item;
      return pending
        ? { ...item, checkedAt: new Date().toISOString(), checkedBy: userId ?? null }
        : { ...item, checkedAt: null, checkedBy: null };
    }),
  );
  const suggestions = buildSuggestions(list.history, items);
  // Le résumé et la barre comptent tout de suite ; les sections attendent le temps de pose.
  const toBuyCount = items.filter((item) => item.checkedAt === null).length;
  const takenCount = items.length - toBuyCount;
  const { toBuy, taken } = splitShoppingList(items, held);
  const total = items.length;

  const summary =
    total === 0
      ? "Rien à acheter pour l’instant"
      : toBuyCount === 0
        ? "Tout est pris, bravo !"
        : `${toBuyCount} à acheter${takenCount > 0 ? ` · ${takenCount} déjà pris` : ""}`;

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
    setUnsortedItem(null);

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
        const added = await addShoppingItem(groupId, { label, quantity }, list?.aisles.chosen);
        // Pas reconnu : on propose de le ranger, et le foyer s'en souviendra.
        if (added.aisle === "autres") setUnsortedItem(added);
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
      await addShoppingItem(
        groupId,
        { label: suggestion.label, quantity: suggestion.quantity ?? "" },
        list?.aisles.chosen,
      );
      hapticAdded();
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été ajouté", error));
    } finally {
      setAddingSuggestion(null);
    }
  }

  // Retient l'article à sa place, coche visible, puis replie sa ligne après le temps de pose.
  // Chaque article a son propre délai : on enchaîne les coches sans que rien ne bouge sous le
  // doigt. Pas de nettoyage au démontage : mettre à jour un écran déjà quitté ne fait rien.
  function holdInPlace(item: ShoppingItem) {
    setHeld((current) => new Map(current).set(item.id, current.get(item.id) ?? sectionOf(item)));
    setSettling((current) => withoutId(current, item.id));
    clearTimeout(settleTimersRef.current.get(item.id));
    settleTimersRef.current.set(
      item.id,
      setTimeout(
        () => setSettling((current) => new Set(current).add(item.id)),
        ROW_SETTLE_DELAY_MS,
      ),
    );
  }

  // La ligne est repliée : l'article rejoint sa vraie section.
  function finishMove(itemId: string) {
    setHeld((current) => {
      const next = new Map(current);
      next.delete(itemId);
      return next;
    });
    setSettling((current) => withoutId(current, itemId));
  }

  function toggleTaken() {
    hapticTick();
    // Replier « Déjà pris » démonte ses lignes : un article décoché qui y attendait rejoint
    // « À acheter » tout de suite (sa ligne ne finirait jamais de se replier).
    if (isTakenOpen) {
      setHeld((current) => new Map([...current].filter(([, section]) => section !== "taken")));
    }
    setIsTakenOpen((value) => !value);
  }

  async function handleToggle(item: ShoppingItem) {
    const checked = item.checkedAt === null;
    hapticToggle(checked);
    holdInPlace(item);
    setError(null);
    setPendingChecks((current) => new Map(current).set(item.id, { checked, confirmedFor: null }));
    try {
      await setShoppingItemChecked(item.id, checked);
      // Le prochain rechargement porte ce numéro : c'est lui qui effacera la coche en attente.
      const nextRequest = latestRequestRef.current + 1;
      setPendingChecks((current) => {
        const pending = current.get(item.id);
        // Un autre toucher a pris le relais entre-temps : c'est lui qui compte.
        if (!pending || pending.checked !== checked) return current;
        return new Map(current).set(item.id, { checked, confirmedFor: nextRequest });
      });
      loadList();
    } catch (error) {
      hapticReject();
      setError(failureMessage("La coche n’est pas passée", error));
      // Échec : l'article revient à son vrai état.
      setPendingChecks((current) => {
        const next = new Map(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  // L'étoile « indispensable » : affichée tout de suite, effacée seulement quand une liste
  // rechargée après la confirmation arrive (sinon elle clignoterait, comme les coches).
  async function handleToggleStar(item: ShoppingItem) {
    const important = !item.isImportant;
    hapticTick();
    setError(null);
    setPendingStars((current) => new Map(current).set(item.id, { important, confirmedFor: null }));
    try {
      await setShoppingItemImportant(item.id, important);
      const nextRequest = latestRequestRef.current + 1;
      setPendingStars((current) => {
        const pending = current.get(item.id);
        if (!pending || pending.important !== important) return current;
        return new Map(current).set(item.id, { important, confirmedFor: nextRequest });
      });
      loadList();
    } catch (cause) {
      hapticReject();
      setError(failureMessage("L’étoile n’a pas été posée", cause));
      setPendingStars((current) => {
        const next = new Map(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  // « Choisir le rayon » : une feuille native ; la liste se recharge en reprenant la main.
  function openAisleSheet(item: ShoppingItem) {
    setEditingId(null);
    setUnsortedItem(null);
    router.push({
      pathname: "/courses/rayon",
      params: { itemId: item.id, label: item.label, aisle: item.aisle },
    });
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
        <Pressable
          onPress={() => openAisleSheet(item)}
          accessibilityRole="button"
          accessibilityLabel={`Rayon : ${AISLE_LABELS[item.aisle]}. Changer de rayon`}
          style={({ pressed }) => [styles.aisleRow, pressed && styles.pressed]}
        >
          <Text style={styles.aisleRowLabel}>Rayon</Text>
          <Text style={styles.aisleRowValue}>{AISLE_LABELS[item.aisle]}</Text>
          <Feather name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>
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

  function renderItem(item: ShoppingItem, index: number, section: ShoppingSection) {
    const isTaken = item.checkedAt !== null;
    const checker = item.checkedBy ? list?.members.get(item.checkedBy) : undefined;
    const description = [
      item.label,
      item.quantity,
      isTaken ? `pris par ${nameOf(item.checkedBy)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    // Elle se replie si son temps de pose est écoulé et qu'elle doit changer de section.
    const isCollapsing = settling.has(item.id) && held.get(item.id) !== sectionOf(item);

    return (
      <CollapsingRow
        key={item.id}
        isCollapsing={isCollapsing}
        onCollapsed={() => finishMove(item.id)}
      >
        {index > 0 ? <View style={styles.separator} /> : null}
        {item.id === editingId ? (
          renderEditPanel(item)
        ) : (
          <Pressable
            onPress={() => handleToggle(item)}
            disabled={isCollapsing}
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
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Animated.View
              style={[styles.checkbox, colorTransition, isTaken && styles.checkboxChecked]}
            >
              {isTaken ? (
                <Animated.View entering={checkEntering}>
                  <Feather name="check" size={15} color={theme.colors.onPrimary} />
                </Animated.View>
              ) : null}
            </Animated.View>
            <StrikeLabel label={item.label} isStruck={isTaken} />
            <View style={styles.spacer} />
            {item.quantity ? <Text style={styles.quantity}>{item.quantity}</Text> : null}
            {section === "toBuy" ? (
              <Pressable
                onPress={() => handleToggleStar(item)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} : indispensable`}
                accessibilityState={{ selected: item.isImportant }}
                style={({ pressed }) => [styles.star, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name={item.isImportant ? "star" : "star-outline"}
                  size={22}
                  // Vide : la couleur du contour des cases, lisible en clair comme en sombre.
                  color={item.isImportant ? theme.colors.star : theme.colors.inputBorder}
                />
              </Pressable>
            ) : null}
            {isTaken && section === "taken" ? (
              <Avatar
                name={checker?.name ?? nameOf(item.checkedBy)}
                avatar={checker?.avatar ?? null}
                photoPath={checker?.photoPath ?? null}
                size={22}
              />
            ) : null}
          </Pressable>
        )}
      </CollapsingRow>
    );
  }

  const trip = tripToShow(list.trips, userId);
  // Partir aux courses n'a de sens qu'à plusieurs, et s'il n'y a pas déjà un passage en cours.
  const canStartTrip = list.members.size >= 2 && trip === null;

  return (
    <View style={styles.screen}>
      {/* « Je pars faire les courses » dans l'en-tête : une action du moment, pas une carte. */}
      <Stack.Screen
        options={{
          headerRight: canStartTrip
            ? () => (
                <HeaderButton
                  label={isTripBusy ? "…" : "Je vais aux courses"}
                  icon="shopping-bag"
                  onPress={() => {
                    if (!isTripBusy) handleStartTrip();
                  }}
                />
              )
            : undefined,
        }}
      />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          // Clavier ouvert : un toucher dans la liste coche du premier coup.
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={styles.title} accessibilityRole="header">
                Courses
              </Text>
              <Text style={styles.subtitle}>
                {list.groupName} · {summary}
              </Text>
            </View>
            {total > 0 ? (
              <ProgressRing
                progress={takenCount / total}
                label={`${takenCount}/${total}`}
                accessibilityLabel={`${takenCount} pris sur ${total}`}
              />
            ) : null}
          </View>

          <ShoppingTripCard
            trips={list.trips}
            userId={userId}
            nameOf={(profileId) => list.members.get(profileId)?.name ?? "Quelqu’un"}
            isBusy={isTripBusy}
            onEnd={handleEndTrip}
          />

          {notice ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          {unsortedItem ? (
            <View style={styles.unsorted} accessibilityLiveRegion="polite">
              <Text style={styles.unsortedText}>
                «{"\u00A0"}
                {unsortedItem.label}
                {"\u00A0"}» est rangé dans Autres.
              </Text>
              <TextButton label="Choisir le rayon" onPress={() => openAisleSheet(unsortedItem)} />
            </View>
          ) : null}
          {error ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {error}
            </Text>
          ) : null}

          {/* Pas d'animation d'entrée au premier affichage : seulement quand la liste bouge. */}
          <LayoutAnimationConfig skipEntering>
            {toBuy.length > 0 ? (
              <View style={styles.sections}>
                <SegmentedControl
                  accessibilityLabel="Trier la liste"
                  value={sortMode}
                  onChange={setSortMode}
                  options={[
                    { value: "aisle", label: "Par rayon" },
                    { value: "added", label: "Par ajout" },
                  ]}
                />
                {groupShoppingItems(toBuy, list.aisles.order, sortMode).map((group) => (
                  <View key={group.key} style={styles.block}>
                    <SectionHeader
                      title={`${
                        group.key === "important"
                          ? "★ Indispensable"
                          : group.key === "all"
                            ? "À acheter"
                            : AISLE_LABELS[group.key]
                      } · ${group.items.length}`}
                    />
                    <View style={styles.group}>
                      {group.items.map((item, index) => renderItem(item, index, "toBuy"))}
                    </View>
                  </View>
                ))}
                {sortMode === "aisle" ? (
                  <View style={styles.orderLink}>
                    <TextButton
                      label="Ordre des rayons"
                      onPress={() =>
                        router.push({ pathname: "/courses/rayons", params: { groupId } })
                      }
                    />
                  </View>
                ) : null}
              </View>
            ) : taken.length > 0 ? (
              // Tout est pris : le chat, et on rentre.
              <View style={styles.done}>
                <SignatureCat size={64} />
                <Text style={styles.doneTitle}>Tout est pris !</Text>
                <Text style={styles.doneText}>Bon retour à la maison.</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>
                La liste est vide. Ajoute ce qui manque à la maison, en bas de l’écran.
              </Text>
            )}

            {taken.length > 0 ? (
              // « Déjà pris » en accordéon : replié, une ligne et son compteur.
              <View style={styles.group}>
                <Pressable
                  onPress={toggleTaken}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isTakenOpen }}
                  accessibilityLabel={`Déjà pris, ${taken.length}`}
                  style={({ pressed }) => [styles.takenHead, pressed && styles.rowPressed]}
                >
                  <Text style={styles.takenTitle}>Déjà pris</Text>
                  {/* Nouvelle clé à chaque arrivée : le compteur fait un petit bond. */}
                  <Animated.View key={taken.length} entering={countBump} style={styles.badge}>
                    <Text style={styles.badgeText}>{taken.length}</Text>
                  </Animated.View>
                  <View style={styles.spacer} />
                  <Feather
                    name={isTakenOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
                {isTakenOpen ? (
                  <>
                    <View style={styles.separatorFull} />
                    {taken.map((item, index) => renderItem(item, index, "taken"))}
                    <View style={styles.clear}>
                      <TextButton
                        label={
                          takenCount > 1 ? `Retirer les ${takenCount} achetés` : "Retirer l’acheté"
                        }
                        onPress={handleClear}
                        isDisabled={isClearing}
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </LayoutAnimationConfig>
        </ScrollView>

        {/* L'ajout en bas, sous le pouce : on remplit la liste sans remonter. */}
        <View style={[styles.dock, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
          {suggestions.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chips}
              accessibilityLabel="Souvent acheté"
            >
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.label}
                  onPress={() => handleAddSuggestion(suggestion)}
                  disabled={addingSuggestion !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${suggestion.label}${suggestion.quantity ? `, ${suggestion.quantity}` : ""}`}
                  style={({ pressed }) => [
                    styles.chip,
                    (pressed || addingSuggestion === suggestion.label) && styles.pressed,
                  ]}
                >
                  <Feather name="plus" size={14} color={theme.colors.primary} />
                  <Text style={styles.chipText}>{suggestion.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
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
                submitBehavior="submit"
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
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {labelError}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function sectionOf(item: ShoppingItem): ShoppingSection {
  return item.checkedAt === null ? "toBuy" : "taken";
}

function withoutId(ids: Set<string>, id: string): Set<string> {
  if (!ids.has(id)) return ids;
  const next = new Set(ids);
  next.delete(id);
  return next;
}

function createStyles({ colors, spacing, radius, control, fonts, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
    },

    titleRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
    titleText: { flex: 1, gap: spacing.xs },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    subtitle: { color: colors.textMuted, fontSize: fontSize.small },

    block: { gap: spacing.sm },
    sections: { gap: spacing.lg },
    orderLink: { alignItems: "center", marginTop: -spacing.sm },
    star: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    // « Rangé dans Autres » : un bandeau teinté avec son action.
    unsorted: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
    },
    unsortedText: { flex: 1, color: colors.text, fontSize: fontSize.small },
    // Dans l'article ouvert : son rayon, qui ouvre la feuille « Choisir le rayon ».
    aisleRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    aisleRowLabel: { color: colors.textMuted, fontSize: fontSize.small },
    aisleRowValue: {
      flex: 1,
      textAlign: "right",
      color: colors.text,
      fontSize: fontSize.small,
      fontWeight: "600",
    },
    // Une liste groupée : une seule surface, une seule ombre.
    group: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
      overflow: "hidden",
    },
    // Filet entre deux lignes, aligné sur le texte (marge 16 + case 24 + espace 12).
    separator: {
      position: "absolute",
      top: 0,
      left: 52,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    separatorFull: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

    // Une ligne : toute la ligne coche, une grande cible d'une main dans le magasin.
    row: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    rowPressed: { backgroundColor: colors.surface2 },
    // Case ronde, comme Rappels et Things : elle se remplit, la coche apparaît.
    checkbox: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    spacer: { flex: 1 },
    quantity: { color: colors.textMuted, fontSize: fontSize.small, fontVariant: ["tabular-nums"] },

    takenHead: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    takenTitle: { color: colors.textMuted, fontSize: fontSize.body - 1, fontWeight: "600" },
    badge: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: 7,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.surface2,
    },
    badgeText: { color: colors.text, fontSize: fontSize.caption, fontWeight: "800" },
    clear: { alignItems: "center", paddingBottom: spacing.xs },

    done: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
    doneTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
    doneText: { color: colors.textMuted, fontSize: fontSize.small },
    emptyText: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: 24,
      paddingHorizontal: spacing.xs,
    },

    // Le dock du bas : « Souvent acheté » en chips, puis le champ d'ajout.
    dock: {
      gap: spacing.sm,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    chips: { gap: spacing.xs + 2 },
    chip: {
      height: control.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surface2,
    },
    chipText: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
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

    // L'article ouvert par un appui long : corriger ou retirer, sur place.
    editPanel: {
      margin: spacing.sm,
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
