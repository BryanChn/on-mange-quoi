// Liste de courses d'un foyer (migration shopping_items) : lire, ajouter, cocher, retirer,
// suivre en direct. Les règles d'accès sont dans la base (RLS : membres du foyer) ; la RLS
// refuse parfois sans erreur (0 ligne) : on le vérifie pour ne pas annoncer un faux succès.
import { cleanShoppingInput, sortShoppingList, type ShoppingItem } from "./shopping-rules";
import { supabase } from "./supabase";

const COLUMNS = "id, label, quantity, added_by, checked_at, checked_by, created_at";

type Row = {
  id: string;
  label: string;
  quantity: string | null;
  added_by: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
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
  };
}

// La liste triée pour l'écran (reste à acheter, puis déjà pris).
export async function fetchShoppingList(groupId: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("shopping_items")
    .select(COLUMNS)
    .eq("group_id", groupId);
  if (error) throw error;
  return sortShoppingList(data.map(toItem));
}

export async function addShoppingItem(
  groupId: string,
  input: { label: string; quantity: string },
): Promise<ShoppingItem> {
  const { label, quantity } = cleanShoppingInput(input.label, input.quantity);
  const { data, error } = await supabase
    .from("shopping_items")
    .insert({ group_id: groupId, label, quantity })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data);
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

// « Retirer les achetés » : supprime les articles cochés du groupe. Renvoie combien.
export async function clearCheckedItems(groupId: string): Promise<number> {
  const { data, error } = await supabase
    .from("shopping_items")
    .delete()
    .eq("group_id", groupId)
    .not("checked_at", "is", null)
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
    .subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleReload();
    });

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
