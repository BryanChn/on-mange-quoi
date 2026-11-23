import type { Enums } from "./database.types";
import { compareByJoinDate, type Member } from "./members";
import type { OrderLine } from "./soiree-rules";
import { supabase } from "./supabase";

// Soirées (V1) : un groupe éphémère pour organiser un repas à plusieurs. Règles côté serveur
// (migrations soirees et soirees_preview_and_guests) ; ici, seulement les appels.
// Sans React Native (testé avec node) : le partage est dans share-soiree.ts.

export type SoireeStep = Enums<"soiree_step">;

// Adresse publique de la version web (EAS Hosting) : le lien partagé y mène.
const WEB_URL = "https://on-mange-quoi.expo.app";

export function soireeLink(joinToken: string): string {
  return `${WEB_URL}/rejoindre/${joinToken}`;
}

export type SoireeMember = Member & { isGuest: boolean };

export type OrderItem = OrderLine & { id: string };

export type SoireeDetail = {
  id: string;
  name: string;
  ownerId: string;
  step: SoireeStep;
  restaurant: string | null;
  joinToken: string;
  // À taper dans « Rejoindre avec un code » par quelqu'un qui a déjà l'app.
  inviteCode: string;
  // Du plus ancien au plus récent.
  members: SoireeMember[];
  // Dans l'ordre d'ajout.
  items: OrderItem[];
};

export type SoireePreview = {
  id: string;
  name: string;
  ownerName: string;
  step: SoireeStep;
  memberCount: number;
  members: { name: string; avatar: string | null }[];
  isMember: boolean;
};

const SOIREE_COLUMNS =
  "id, name, invite_code, owner_id, kind, soiree_step, restaurant, join_token, group_members(profile_id, joined_at, profiles(display_name, avatar, photo_path, is_guest))";

// create_soiree : soirée, lien et inscription du créateur dans la même transaction.
export async function createSoiree(name: string): Promise<{ id: string; joinToken: string }> {
  const { data, error } = await supabase.rpc("create_soiree", { soiree_name: name });
  if (error) throw error;
  if (!data.join_token) throw new Error("Soirée créée sans lien.");
  return { id: data.id, joinToken: data.join_token };
}

// single : une soirée absente, ou dont on n'est pas membre (masquée par la RLS), lève une erreur.
export async function fetchSoiree(soireeId: string): Promise<SoireeDetail> {
  // Deux requêtes en parallèle : order_items pointe vers group_members (FK composée), pas
  // vers groups, donc PostgREST ne peut pas l'embarquer dans la requête de la soirée.
  const [soireeResult, itemsResult] = await Promise.all([
    supabase.from("groups").select(SOIREE_COLUMNS).eq("id", soireeId).eq("kind", "soiree").single(),
    supabase
      .from("order_items")
      .select("id, profile_id, label, quantity, note")
      .eq("group_id", soireeId)
      .order("created_at", { ascending: true }),
  ]);

  const { data, error } = soireeResult;
  if (error) throw error;
  if (itemsResult.error) throw itemsResult.error;
  if (!data.soiree_step || !data.join_token) throw new Error("Ce groupe n'est pas une soirée.");

  return {
    id: data.id,
    name: data.name,
    ownerId: data.owner_id,
    step: data.soiree_step,
    restaurant: data.restaurant,
    joinToken: data.join_token,
    inviteCode: data.invite_code,
    members: data.group_members
      .map((row) => ({
        id: row.profile_id,
        name: row.profiles?.display_name ?? "Quelqu’un",
        joinedAt: row.joined_at,
        avatar: row.profiles?.avatar ?? null,
        photoPath: row.profiles?.photo_path ?? null,
        isGuest: row.profiles?.is_guest ?? false,
      }))
      .sort(compareByJoinDate),
    items: itemsResult.data.map((item) => ({
      id: item.id,
      profileId: item.profile_id,
      label: item.label,
      quantity: item.quantity,
      note: item.note,
    })),
  };
}

// La soirée d'un invité : il n'en a qu'une (il n'entre que par un lien). null : elle a été
// effacée (24 h après la commande) ou il l'a quittée.
export async function fetchFirstSoireeId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("groups")
    .select("id")
    .eq("kind", "soiree")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data.at(0)?.id ?? null;
}

// Fonctionne sans compte (rôle anon) : la page du lien s'affiche avant de rejoindre.
// null : aucun lien ne correspond (mal copié, ou soirée effacée).
export async function fetchSoireePreview(joinToken: string): Promise<SoireePreview | null> {
  const { data, error } = await supabase.rpc("soiree_preview", { token: joinToken });
  if (error) throw error;

  const row = data.at(0);
  if (!row) return null;
  const members = Array.isArray(row.members)
    ? (row.members as { name: string; avatar: string | null }[])
    : [];

  return {
    id: row.id,
    name: row.name,
    ownerName: row.owner_name,
    step: row.step,
    memberCount: row.member_count,
    members,
    isMember: row.is_member,
  };
}

// Rejoint la soirée du lien. Sans compte : connexion anonyme d'abord, puis le pseudo crée le
// profil d'invité (join_soiree). Avec un compte : nom et avatar du profil, guest ignoré.
// Les refus (lien invalide, commande passée, complète) gardent leur hint : toJoinFailure.
export async function joinSoiree(
  joinToken: string,
  guest?: { name: string; avatar: string | null },
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) throw signInError;
  }

  const { data, error } = await supabase.rpc("join_soiree", {
    token: joinToken,
    guest_name: guest?.name,
    guest_avatar: guest?.avatar ?? undefined,
  });
  if (error) throw error;
  return data;
}

// Le responsable retire quelqu'un (ses lignes de commande partent avec lui). La RLS refuse
// sans erreur (0 ligne) : on le vérifie pour ne pas annoncer un retrait qui n'a pas eu lieu.
export async function removeParticipant(soireeId: string, profileId: string): Promise<void> {
  const { data, error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", soireeId)
    .eq("profile_id", profileId)
    .select("profile_id");

  if (error) throw error;
  if (data.length === 0) throw new Error("Participant non retiré.");
}

// ─── la commande ─────────────────────────────────────────
// Hors de l'étape « commande », le serveur refuse avec le hint ordering_closed
// (isOrderingClosedError) : l'écran recharge et montre la commande figée.

// Mêmes limites que les colonnes de order_items.
export const ORDER_LABEL_MAX_LENGTH = 80;
export const ORDER_NOTE_MAX_LENGTH = 120;
export const ORDER_MAX_QUANTITY = 20;

export function isOrderingClosedError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "hint" in error
    ? error.hint === "ordering_closed"
    : false;
}

export async function addOrderItem(
  soireeId: string,
  item: { label: string; note: string | null },
): Promise<void> {
  const note = item.note?.trim() ? item.note.trim() : null;
  const { error } = await supabase
    .from("order_items")
    .insert({ group_id: soireeId, label: item.label.trim(), note, quantity: 1 });
  if (error) throw error;
}

// La RLS ne laisse modifier que ses lignes : 0 ligne touchée = pas la sienne (ou supprimée).
export async function setOrderItemQuantity(itemId: string, quantity: number): Promise<void> {
  const { data, error } = await supabase
    .from("order_items")
    .update({ quantity })
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Ligne non modifiée.");
}

// Sa ligne, ou celle de n'importe qui pour le responsable.
export async function removeOrderItem(itemId: string): Promise<void> {
  const { data, error } = await supabase.from("order_items").delete().eq("id", itemId).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("Ligne non retirée.");
}

// « Commande passée » (responsable) : tout se fige, 24 h d'historique.
export async function markOrdered(soireeId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_ordered", { target_group_id: soireeId });
  if (error) throw error;
}

// Le responsable fixe le resto sans vote : la commande s'ouvre.
export async function chooseRestaurant(soireeId: string, restaurant: string): Promise<void> {
  const { error } = await supabase.rpc("choose_restaurant", {
    target_group_id: soireeId,
    restaurant_name: restaurant,
  });
  if (error) throw error;
}

// Plusieurs arrivées en rafale (un lien partagé dans un groupe WhatsApp) : on attend ce délai
// sans nouvel événement avant de recharger, une seule fois.
const RELOAD_DELAY_MS = 300;

// Appelle onChange quand quelqu'un arrive ou part, que l'étape change ou qu'une ligne de
// commande bouge. Pas de filtre sur
// group_members : un DELETE ne transporte que la clé (limite de Supabase Realtime, voir
// subscribeToHome) ; la RLS ne laisse passer que les soirées et groupes du membre.
export function subscribeToSoiree(soireeId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function scheduleReload() {
    clearTimeout(timer);
    timer = setTimeout(onChange, RELOAD_DELAY_MS);
  }

  const channel = supabase
    .channel(`soiree:${soireeId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_members" },
      scheduleReload,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "groups", filter: `id=eq.${soireeId}` },
      scheduleReload,
    )
    // Les lignes de commande des autres, en direct (sans filtre : même raison que plus haut).
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleReload)
    .subscribe();

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
