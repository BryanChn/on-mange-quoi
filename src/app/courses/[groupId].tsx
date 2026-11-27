import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { AisleSection } from "@/components/aisle-section";
import { Avatar } from "@/components/avatar";
import { HeaderButton } from "@/components/header-button";
import { ProgressRing } from "@/components/progress-ring";
import { ShoppingTripCard } from "@/components/shopping-trip-card";
import { SignatureCat } from "@/components/signature-cat";
import { ErrorScreen, LoadingScreen } from "@/components/status-screens";
import { StrikeLabel } from "@/components/strike-label";
import { TextButton } from "@/components/text-button";
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
import { checkEntering, colorTransition } from "@/lib/motion";
import { failureMessage, loadErrorMessage } from "@/lib/network-errors";
import { useSession } from "@/lib/session";
import {
  addShoppingItem,
  clearCheckedItems,
  endShoppingTrip,
  fetchActiveTrips,
  fetchAisleSettings,
  fetchShoppingHistory,
  fetchShoppingList,
  setShoppingItemChecked,
  setShoppingItemImportant,
  startShoppingTrip,
  subscribeToShoppingList,
  type AisleSettings,
  type ShoppingTrip,
} from "@/lib/shopping";
import {
  AISLE_LABELS,
  buildSuggestions,
  byAddedOrder,
  findDuplicate,
  groupShoppingItems,
  SHOPPING_LABEL_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX_LENGTH,
  tripToShow,
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

type PendingMap<T> = Map<string, { value: T; confirmedFor: number | null }>;

// Le mode d'emploi n'apparaît qu'une fois par téléphone.
const TIP_KEY = "omq.courses.tip-seen";

// La liste de courses d'un foyer, rangée par rayon (maquette du 27/11 :
// https://claude.ai/artifact/7mpAE8Dc6HmkNigkPi4GV3). Chaque rayon est un accordéon avec son
// avancement (« 2/5 ») ; terminé, il se replie avec une coche. Un toucher coche (le geste du
// magasin) ; ⋯ ou un appui long ouvre la fiche de l'article. L'ajout est en bas, sous le pouce.
// Tout le monde la voit bouger en direct.
export default function ShoppingListScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
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
  const [isAdding, setIsAdding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isTripBusy, setIsTripBusy] = useState(false);
  // Suggestion en cours d'ajout : pas de double ajout sur un double toucher.
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  // Coches et étoiles affichées dès le toucher, avant la réponse du serveur. confirmedFor : le
  // numéro du rechargement lancé après la confirmation ; la valeur en attente ne s'efface qu'à
  // son arrivée (sinon l'écran montrerait un instant l'état d'avant).
  const [pendingChecks, setPendingChecks] = useState<PendingMap<boolean>>(new Map());
  const [pendingStars, setPendingStars] = useState<PendingMap<boolean>>(new Map());
  // Les rayons repliés ou ouverts à la main ; sans choix, un rayon terminé est replié.
  const [openOverrides, setOpenOverrides] = useState<Map<string, boolean>>(new Map());
  // null : on ne sait pas encore (lecture du téléphone en cours) ; rien ne s'affiche.
  const [isTipVisible, setIsTipVisible] = useState(false);

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
        // Ce rechargement suit la confirmation de ces coches et étoiles : la liste fait foi.
        setPendingChecks((current) => withoutConfirmed(current, requestId));
        setPendingStars((current) => withoutConfirmed(current, requestId));
        setHasFailed(false);
      },
      (cause: unknown) => {
        if (latestRequestRef.current !== requestId) return;
        setLoadError(cause);
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

  // Le stockage du téléphone est un système extérieur : on y lit une fois si le mode d'emploi a
  // déjà été vu. En cas d'échec, on ne l'affiche pas (mieux vaut rien qu'un rappel à chaque fois).
  useEffect(() => {
    AsyncStorage.getItem(TIP_KEY).then(
      (seen) => setIsTipVisible(seen === null),
      () => setIsTipVisible(false),
    );
  }, []);

  function dismissTip() {
    setIsTipVisible(false);
    AsyncStorage.setItem(TIP_KEY, "1").catch(() => undefined);
  }

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

  // La liste telle qu'affichée : coches et étoiles en attente comprises, dans l'ordre d'ajout
  // (un article coché reste à sa place, barré : rien ne bouge sous le doigt).
  const items = list.items
    .map((item) => {
      let shown = item;
      const star = pendingStars.get(item.id)?.value;
      if (star !== undefined && star !== item.isImportant) shown = { ...shown, isImportant: star };
      const checked = pendingChecks.get(item.id)?.value;
      if (checked !== undefined && checked !== (item.checkedAt !== null)) {
        shown = checked
          ? { ...shown, checkedAt: new Date().toISOString(), checkedBy: userId ?? null }
          : { ...shown, checkedAt: null, checkedBy: null };
      }
      return shown;
    })
    .sort(byAddedOrder);
  const suggestions = buildSuggestions(list.history, items);
  const takenCount = items.filter((item) => item.checkedAt !== null).length;
  const toBuyCount = items.length - takenCount;
  const total = items.length;
  const groups = groupShoppingItems(items, list.aisles.order);

  const summary =
    total === 0
      ? "Rien à acheter pour l’instant"
      : toBuyCount === 0
        ? "Tout est pris, bravo !"
        : `${toBuyCount} à acheter${takenCount > 0 ? ` · ${takenCount} pris` : ""}`;

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
    } catch (cause) {
      hapticReject();
      setError(failureMessage("Le départ n’est pas passé", cause));
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
    } catch (cause) {
      hapticReject();
      setError(failureMessage("Ce n’est pas passé", cause));
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
        setNotice(`« ${duplicate.label} » était déjà pris : remis à acheter.`);
      } else {
        const added = await addShoppingItem(groupId, { label, quantity }, list?.aisles.chosen);
        // Pas reconnu : on propose de le ranger, et le foyer s'en souviendra.
        if (added.aisle === "autres") setUnsortedItem(added);
      }
      hapticAdded();
      setLabel("");
      setQuantity("");
      loadList();
    } catch (cause) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été ajouté", cause));
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
    } catch (cause) {
      hapticReject();
      setError(failureMessage("L’article n’a pas été ajouté", cause));
    } finally {
      setAddingSuggestion(null);
    }
  }

  // Coche ou étoile : affichée tout de suite, confirmée par le serveur, effacée à l'arrivée du
  // rechargement suivant. Un échec remet l'état d'avant.
  async function applyOptimistic(
    setPending: (update: (current: PendingMap<boolean>) => PendingMap<boolean>) => void,
    itemId: string,
    value: boolean,
    save: () => Promise<void>,
    failure: string,
  ) {
    setError(null);
    setPending((current) => new Map(current).set(itemId, { value, confirmedFor: null }));
    try {
      await save();
      const nextRequest = latestRequestRef.current + 1;
      setPending((current) => {
        const pending = current.get(itemId);
        // Un autre toucher a pris le relais entre-temps : c'est lui qui compte.
        if (!pending || pending.value !== value) return current;
        return new Map(current).set(itemId, { value, confirmedFor: nextRequest });
      });
      loadList();
    } catch (cause) {
      hapticReject();
      setError(failureMessage(failure, cause));
      setPending((current) => {
        const next = new Map(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  function handleToggle(item: ShoppingItem) {
    const checked = item.checkedAt === null;
    hapticToggle(checked);
    applyOptimistic(
      setPendingChecks,
      item.id,
      checked,
      () => setShoppingItemChecked(item.id, checked),
      "La coche n’est pas passée",
    );
  }

  function handleToggleStar(item: ShoppingItem) {
    const important = !item.isImportant;
    hapticTick();
    applyOptimistic(
      setPendingStars,
      item.id,
      important,
      () => setShoppingItemImportant(item.id, important),
      "L’étoile n’a pas été posée",
    );
  }

  // La fiche d'un article : une feuille native ; la liste se recharge en reprenant la main.
  function openItem(item: ShoppingItem) {
    setUnsortedItem(null);
    router.push({
      pathname: "/courses/article",
      params: {
        itemId: item.id,
        groupId,
        label: item.label,
        quantity: item.quantity ?? "",
        aisle: item.aisle,
        important: item.isImportant ? "1" : "0",
      },
    });
  }

  async function handleClear() {
    setError(null);
    setIsClearing(true);
    try {
      await clearCheckedItems(groupId);
      loadList();
    } catch (cause) {
      hapticReject();
      setError(failureMessage("Les articles pris n’ont pas été retirés", cause));
    } finally {
      setIsClearing(false);
    }
  }

  function toggleSection(key: string, isOpen: boolean) {
    hapticTick();
    setOpenOverrides((current) => new Map(current).set(key, !isOpen));
  }

  function renderItem(item: ShoppingItem, index: number) {
    const isTaken = item.checkedAt !== null;
    const checker = item.checkedBy ? list?.members.get(item.checkedBy) : undefined;
    const description = [
      item.label,
      item.quantity,
      isTaken ? `pris par ${nameOf(item.checkedBy)}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <View key={item.id}>
        {index > 0 ? <View style={styles.separator} /> : null}
        <Pressable
          onPress={() => handleToggle(item)}
          // Toucher coche (le geste du magasin) ; appui long : la fiche, comme le bouton ⋯.
          onLongPress={() => {
            hapticLongPress();
            openItem(item);
          }}
          accessibilityRole="checkbox"
          accessibilityLabel={description}
          accessibilityState={{ checked: isTaken }}
          accessibilityActions={[{ name: "edit", label: "Modifier l’article" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "edit") openItem(item);
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
          {isTaken ? (
            <Avatar
              name={checker?.name ?? nameOf(item.checkedBy)}
              avatar={checker?.avatar ?? null}
              photoPath={checker?.photoPath ?? null}
              size={22}
            />
          ) : (
            <Pressable
              onPress={() => handleToggleStar(item)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} : indispensable`}
              accessibilityState={{ selected: item.isImportant }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={item.isImportant ? "star" : "star-outline"}
                size={22}
                // Vide : la couleur du contour des cases, lisible en clair comme en sombre.
                color={item.isImportant ? theme.colors.star : theme.colors.inputBorder}
              />
            </Pressable>
          )}
          <Pressable
            onPress={() => openItem(item)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Options de ${item.label}`}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Feather name="more-horizontal" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </Pressable>
      </View>
    );
  }

  const trip = tripToShow(list.trips, userId);
  // Partir aux courses n'a de sens qu'à plusieurs, et s'il n'y a pas déjà un passage en cours.
  const canStartTrip = list.members.size >= 2 && trip === null;

  return (
    <View style={styles.screen}>
      {/* « Je vais aux courses » dans l'en-tête : une action du moment, pas une carte. */}
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
              <View style={styles.titleLine}>
                <Text style={styles.title} accessibilityRole="header">
                  Courses
                </Text>
                {/* L'aide, à revoir quand on veut. */}
                {total > 0 && !isTipVisible ? (
                  <Pressable
                    onPress={() => setIsTipVisible(true)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Revoir l’aide"
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Feather name="help-circle" size={20} color={theme.colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
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

          {/* L'aide : affichée d'elle-même la première fois, puis par le « ? » du titre. Trois
              gestes, un par ligne, plutôt qu'un paragraphe. */}
          {isTipVisible && total > 0 ? (
            <View style={styles.tip} accessibilityLiveRegion="polite">
              <View style={styles.tipLines}>
                {[
                  { icon: "check-circle" as const, text: "Touche un article pour le cocher" },
                  {
                    icon: "more-horizontal" as const,
                    text: "Ce bouton ou un appui long : modifier, changer de rayon",
                  },
                  { icon: "chevron-down" as const, text: "Touche un rayon pour le replier" },
                ].map((line) => (
                  <View key={line.icon} style={styles.tipLine}>
                    <Feather name={line.icon} size={15} color={theme.colors.textMuted} />
                    <Text style={styles.tipText}>{line.text}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={dismissTip}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Fermer l’aide"
                style={({ pressed }) => [styles.tipClose, pressed && styles.pressed]}
              >
                <Feather name="x" size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {notice ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          {unsortedItem ? (
            <View style={styles.unsorted} accessibilityLiveRegion="polite">
              <Text style={styles.unsortedText}>
                «{" "}
                {unsortedItem.label}
                {" "}» est rangé dans Autres.
              </Text>
              <TextButton label="Choisir le rayon" onPress={() => openItem(unsortedItem)} />
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

          {total === 0 ? (
            <Text style={styles.emptyText}>
              La liste est vide. Ajoute ce qui manque à la maison, en bas de l’écran.
            </Text>
          ) : toBuyCount === 0 ? (
            // Tout est pris : le chat, et on rentre.
            <View style={styles.done}>
              <SignatureCat size={64} />
              <Text style={styles.doneTitle}>Tout est pris !</Text>
              <Text style={styles.doneText}>Bon retour à la maison.</Text>
            </View>
          ) : null}

          {/* Pas d'animation d'entrée au premier affichage : seulement quand la liste bouge. */}
          <LayoutAnimationConfig skipEntering>
            <View style={styles.sections}>
              {groups.map((group) => {
                const groupTaken = group.items.filter((item) => item.checkedAt !== null).length;
                const isDone = groupTaken === group.items.length;
                const isOpen = openOverrides.get(group.key) ?? !isDone;
                return (
                  <AisleSection
                    key={group.key}
                    aisle={group.key}
                    title={group.key === "important" ? "Indispensable" : AISLE_LABELS[group.key]}
                    takenCount={groupTaken}
                    total={group.items.length}
                    isOpen={isOpen}
                    onToggle={() => toggleSection(group.key, isOpen)}
                  >
                    {group.items.map(renderItem)}
                  </AisleSection>
                );
              })}
            </View>
          </LayoutAnimationConfig>

          {takenCount > 0 || toBuyCount > 0 ? (
            <View style={styles.footerLinks}>
              {takenCount > 0 ? (
                <TextButton
                  label={
                    takenCount > 1
                      ? `Retirer les ${takenCount} articles pris`
                      : "Retirer l’article pris"
                  }
                  onPress={handleClear}
                  isDisabled={isClearing}
                />
              ) : null}
              <TextButton
                label="Ordre des rayons"
                onPress={() => router.push({ pathname: "/courses/rayons", params: { groupId } })}
              />
            </View>
          ) : null}
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

// Les valeurs en attente confirmées avant ce rechargement : la liste rechargée fait foi.
function withoutConfirmed<T>(pending: PendingMap<T>, requestId: number): PendingMap<T> {
  const done = [...pending].filter(
    ([, entry]) => entry.confirmedFor !== null && requestId >= entry.confirmedFor,
  );
  if (done.length === 0) return pending;
  const next = new Map(pending);
  for (const [id] of done) next.delete(id);
  return next;
}

function createStyles({ colors, spacing, radius, control, fonts, fontSize }: Theme) {
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

    titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    // L'aide : une carte discrète, trois lignes courtes, une croix pour la fermer.
    tip: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tipLines: { flex: 1, gap: spacing.sm },
    tipLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    tipText: { flex: 1, color: colors.textMuted, fontSize: fontSize.caption },
    tipClose: { padding: spacing.xs },

    sections: { gap: spacing.md },
    // Filet entre deux lignes, aligné sur le texte (marge 16 + case 26 + espace 12).
    separator: {
      position: "absolute",
      top: 0,
      left: 54,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    // Une ligne : toute la ligne coche, une grande cible d'une main dans le magasin.
    row: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.xs,
      paddingVertical: spacing.xs,
    },
    rowPressed: { backgroundColor: colors.surface2 },
    checkbox: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    spacer: { flex: 1 },
    quantity: { color: colors.textMuted, fontSize: fontSize.small, fontVariant: ["tabular-nums"] },
    iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },

    footerLinks: { alignItems: "center", gap: spacing.xs },
    done: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm },
    doneTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.heading },
    doneText: { color: colors.textMuted, fontSize: fontSize.small },
    emptyText: {
      color: colors.textMuted,
      fontSize: fontSize.body,
      lineHeight: 24,
      paddingHorizontal: spacing.xs,
    },

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

    pressed: { opacity: 0.6 },
    error: { color: colors.danger, fontSize: fontSize.small },
    notice: { color: colors.success, fontSize: fontSize.small },
  });
}
