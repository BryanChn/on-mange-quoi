// Liste de courses d'un foyer (migration shopping_items) : lire, ajouter, cocher, retirer,
// suivre en direct. Les règles d'accès sont dans la base (RLS : membres du foyer) ; la RLS
// refuse parfois sans erreur (0 ligne) : on le vérifie pour ne pas annoncer un faux succès.
import {
  cleanShoppingInput,
  guessAisle,
  normalizeLabel,
  orderedAisles,
  sortShoppingList,
  type ShoppingAisle,
  type ShoppingHistoryEntry,
  type ShoppingItem,
  type ShoppingPlan,
} from "./shopping-rules";
import { supabase } from "./supabase";

const COLUMNS =
  "id, label, quantity, added_by, checked_at, checked_by, created_at, aisle, is_important";

type Row = {
  id: string;
  label: string;
  quantity: string | null;
  added_by: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  aisle: ShoppingAisle;
  is_important: boolean;
};

function toItem(row: Row): ShoppingItem {
  return {
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    addedBy: row.added_by,
    checkedAt: row.checked_at,
    checkedBy: row.checked_by,
    createdAt: row.created_at,
    aisle: row.aisle,
    isImportant: row.is_important,
  };
}

// Les réglages de rayons du foyer : les choix retenus par nom d'article, et l'ordre des rayons.
export type AisleSettings = {
  chosen: Map<string, ShoppingAisle>;
  order: ShoppingAisle[];
};

export async function fetchAisleSettings(groupId: string): Promise<AisleSettings> {
  const choicesRequest = supabase
    .from("shopping_aisle_choices")
    .select("label_key, aisle")
    .eq("group_id", groupId);
  const { data: group, error } = await supabase
    .from("groups")
    .select("aisle_order")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  const { data: choices, error: choicesError } = await choicesRequest;
  if (choicesError) throw choicesError;
  return {
    chosen: new Map(choices.map((choice) => [choice.label_key, choice.aisle])),
    order: orderedAisles(group.aisle_order),
  };
}

// La liste triée pour l'écran (reste à acheter, puis déjà pris), sans les articles rangés.
export async function fetchShoppingList(groupId: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("shopping_items")
    .select(COLUMNS)
    .eq("group_id", groupId)
    .is("cleared_at", null);
  if (error) throw error;
  return sortShoppingList(data.map(toItem));
}

// Les articles rangés les plus récents : de quoi proposer « ce qu'on achète souvent ».
// 300 suffisent largement pour un foyer (plusieurs mois de courses).
const HISTORY_LIMIT = 300;

export async function fetchShoppingHistory(groupId: string): Promise<ShoppingHistoryEntry[]> {
  const { data, error } = await supabase
    .from("shopping_items")
    .select("label, quantity, cleared_at")
    .eq("group_id", groupId)
    .not("cleared_at", "is", null)
    .order("cleared_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  return data.map((row) => ({
    label: row.label,
    quantity: row.quantity,
    clearedAt: row.cleared_at ?? "",
  }));
}

// Le rayon est deviné ici (choix du foyer d'abord, puis le nom) : l'écran n'a rien à faire.
export async function addShoppingItem(
  groupId: string,
  input: { label: string; quantity: string },
  chosen: ReadonlyMap<string, ShoppingAisle> = new Map(),
): Promise<ShoppingItem> {
  const { label, quantity } = cleanShoppingInput(input.label, input.quantity);
  const { data, error } = await supabase
    .from("shopping_items")
    .insert({ group_id: groupId, label, quantity, aisle: guessAisle(label, chosen) })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data);
}

// « Ajouter aux courses » depuis une recette : les nouveaux articles en un seul envoi, avec la
// recette d'où ils viennent, puis ceux déjà pris remis dans « À acheter ». Renvoie le nombre
// d'articles ajoutés ou remis.
export async function addRecipeToShopping(
  groupId: string,
  recipeId: string,
  plan: ShoppingPlan,
): Promise<number> {
  if (plan.toInsert.length > 0) {
    // Les rayons choisis par le foyer s'appliquent aussi aux ingrédients d'une recette.
    const { chosen } = await fetchAisleSettings(groupId);
    const { error } = await supabase.from("shopping_items").insert(
      plan.toInsert.map((addition) => ({
        group_id: groupId,
        label: addition.label,
        quantity: addition.quantity,
        recipe_id: recipeId,
        aisle: guessAisle(addition.label, chosen),
      })),
    );
    if (error) throw error;
  }
  if (plan.toUncheck.length > 0) {
    const { error } = await supabase
      .from("shopping_items")
      .update({ checked_at: null })
      .in("id", plan.toUncheck);
    if (error) throw error;
  }
  return plan.toInsert.length + plan.toUncheck.length;
}

// Corriger un article (« Lait · 2 » → « Lait · 3 ») sans le retirer puis le rajouter.
export async function updateShoppingItem(
  itemId: string,
  input: { label: string; quantity: string },
): Promise<void> {
  const { label, quantity } = cleanShoppingInput(input.label, input.quantity);
  const { data, error } = await supabase
    .from("shopping_items")
    .update({ label, quantity })
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Article non modifié.");
}

// L'app dit seulement « coché » ou non : l'heure et l'auteur sont posés par le serveur
// (trigger stamp_shopping_item_check), quelle que soit la date envoyée.
export async function setShoppingItemChecked(itemId: string, checked: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("shopping_items")
    .update({ checked_at: checked ? new Date().toISOString() : null })
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Article non modifié.");
}

export async function removeShoppingItem(itemId: string): Promise<void> {
  const { data, error } = await supabase
    .from("shopping_items")
    .delete()
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Article non retiré.");
}

// « Retirer les achetés » : range les articles cochés du groupe (ils quittent la liste et
// nourrissent les suggestions). L'heure vient du serveur (trigger). Renvoie combien.
export async function clearCheckedItems(groupId: string): Promise<number> {
  const { data, error } = await supabase
    .from("shopping_items")
    .update({ cleared_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .not("checked_at", "is", null)
    .is("cleared_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}

// Plusieurs changements en rafale (on coche vite dans le magasin) : un seul rechargement.
const RELOAD_DELAY_MS = 300;

// Appelle onChange quand un article est ajouté, coché, modifié ou retiré dans ce groupe.
// INSERT et UPDATE transportent la ligne : filtrés sur group_id. Un DELETE ne transporte que
// la clé (limite de Supabase Realtime) : écouté sans filtre, la RLS ne laisse passer que les
// foyers du membre. Comme les autres écrans, rattrape ce qui a changé pendant une coupure.
export function subscribeToShoppingList(groupId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function scheduleReload() {
    clearTimeout(timer);
    timer = setTimeout(onChange, RELOAD_DELAY_MS);
  }

  const filter = `group_id=eq.${groupId}`;
  const channel = supabase
    .channel(`shopping:${groupId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "shopping_items", filter },
      scheduleReload,
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "shopping_items", filter },
      scheduleReload,
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "shopping_items" },
      scheduleReload,
    )
    // Qui est aux courses (« Léa est aux courses jusqu'à 19 h 40 »), départ et « J'ai fini ».
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shopping_trips", filter },
      scheduleReload,
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleReload();
    });

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

export type ShoppingListSummary = { groupId: string; name: string; toBuy: number };

// Les listes de courses de tous les foyers du membre, avec ce qui reste à acheter : l'écran
// de choix quand plusieurs listes attendent. Deux requêtes, pas une par foyer.
export async function fetchShoppingLists(): Promise<ShoppingListSummary[]> {
  const [groups, items] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("kind", "foyer")
      .order("created_at", { ascending: true }),
    supabase
      .from("shopping_items")
      .select("group_id")
      .is("checked_at", null)
      .is("cleared_at", null),
  ]);
  if (groups.error) throw groups.error;
  if (items.error) throw items.error;
  const toBuy = new Map<string, number>();
  for (const item of items.data) toBuy.set(item.group_id, (toBuy.get(item.group_id) ?? 0) + 1);
  return groups.data.map((group) => ({
    groupId: group.id,
    name: group.name,
    toBuy: toBuy.get(group.id) ?? 0,
  }));
}

// ─── « Je pars faire les courses » (migration shopping_trips) ───

// Un passage en cours : qui y est, jusqu'à quand.
export type ShoppingTrip = { shopperId: string; endsAt: string };

// Les passages en cours du foyer, le plus récent d'abord.
export async function fetchActiveTrips(groupId: string): Promise<ShoppingTrip[]> {
  const { data, error } = await supabase
    .from("shopping_trips")
    .select("shopper_id, ends_at")
    .eq("group_id", groupId)
    .gt("ends_at", new Date().toISOString())
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ shopperId: row.shopper_id, endsAt: row.ends_at }));
}

// Le foyer est prévenu (sauf la nuit, ou si un départ a déjà été annoncé il y a moins de
// 30 min) ; un passage déjà en cours est rendu tel quel.
// Renvoie si le foyer a été prévenu, pour que l'écran le dise juste.
export async function startShoppingTrip(groupId: string): Promise<{ isAnnounced: boolean }> {
  const { data, error } = await supabase.rpc("start_shopping_trip", { target_group_id: groupId });
  if (error) throw error;
  return { isAnnounced: data.announced };
}

// « J'ai fini » : plus aucun ajout ne prévient.
export async function endShoppingTrip(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("end_shopping_trip", { target_group_id: groupId });
  if (error) throw error;
}

// L'étoile « indispensable » : l'article passe en tête de la liste, quel que soit le tri.
export async function setShoppingItemImportant(itemId: string, important: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("shopping_items")
    .update({ is_important: important })
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Article non modifié.");
}

// Ranger un article dans un autre rayon ; le foyer s'en souvient pour ce nom.
export async function setShoppingItemAisle(
  item: Pick<ShoppingItem, "id" | "label">,
  aisle: ShoppingAisle,
): Promise<void> {
  const { error } = await supabase.rpc("set_shopping_item_aisle", {
    target_item_id: item.id,
    new_aisle: aisle,
    item_label_key: normalizeLabel(item.label),
  });
  if (error) throw error;
}

// L'ordre des rayons du foyer, dans l'ordre où l'on traverse le magasin.
export async function saveAisleOrder(groupId: string, order: ShoppingAisle[]): Promise<void> {
  const { error } = await supabase.rpc("set_aisle_order", {
    target_group_id: groupId,
    new_order: order,
  });
  if (error) throw error;
}
