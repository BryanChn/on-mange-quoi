// Règles pures de la liste de courses, sans Supabase ni React Native : testées avec node --test.

// Mêmes limites que les colonnes de shopping_items.
export const SHOPPING_LABEL_MAX_LENGTH = 80;
export const SHOPPING_QUANTITY_MAX_LENGTH = 20;

export type ShoppingItem = {
  id: string;
  label: string;
  // Texte libre (« 2 », « 500 g »), ou null.
  quantity: string | null;
  addedBy: string | null;
  // Coché = « je l'ai pris ». Heure et auteur posés par le serveur.
  checkedAt: string | null;
  checkedBy: string | null;
  createdAt: string;
};

// Ce qui reste à acheter d'abord, dans l'ordre d'ajout (on remplit la liste au fil de la
// semaine) ; puis ce qui est déjà pris, le dernier pris en tête (on voit ce qui vient
// d'être mis dans le caddie).
export function sortShoppingList(items: ShoppingItem[]): ShoppingItem[] {
  const toBuy = items
    .filter((item) => item.checkedAt === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const taken = items
    .filter((item) => item.checkedAt !== null)
    .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""));
  return [...toBuy, ...taken];
}

// Texte saisi → valeurs à enregistrer : espaces superflus retirés, quantité vide = null.
export function cleanShoppingInput(
  label: string,
  quantity: string,
): { label: string; quantity: string | null } {
  const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
  const cleanQuantity = tidy(quantity);
  return { label: tidy(label), quantity: cleanQuantity === "" ? null : cleanQuantity };
}
