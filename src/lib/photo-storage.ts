import { getUserId, supabase } from "./supabase";

// Photo de profil (migration profile_photo) : bucket privé « avatars », un dossier par
// personne, un nouveau fichier à chaque envoi. Sans React Native (testé avec node) : le choix
// et la réduction de la photo sont dans photo-picker.ts.

const BUCKET = "avatars";
// Photos des recettes (migration recipes) : <foyer>/<uuid>.jpg, visibles par le foyer.
export const RECIPE_BUCKET = "recipe-photos";

// Photo d'une recette de base (migration base_recipe_photos) : base/<uuid>.jpg, partagée par
// toutes ses copies. L'app ne l'efface jamais (le stockage le refuserait aussi) : une copie
// qui change ou retire sa photo laisse l'originale aux autres foyers.
export function isBaseRecipePhoto(path: string): boolean {
  return path.startsWith("base/");
}

async function removeOwnRecipePhoto(path: string): Promise<void> {
  if (isBaseRecipePhoto(path)) return;
  await supabase.storage.from(RECIPE_BUCKET).remove([path]);
}

// Lien temporaire : valable 1 h, redemandé 5 min avant la fin.
const URL_LIFETIME_S = 60 * 60;
const URL_MARGIN_MS = 5 * 60 * 1000;

// Nom de fichier unique (pas un secret : la RLS du stockage protège l'accès). crypto.randomUUID
// n'existe pas dans Hermes, le moteur JavaScript de l'app.
function randomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

// Envoie la photo (JPEG déjà réduit), l'enregistre sur le profil, puis supprime l'ancienne.
// Renvoie le chemin de la nouvelle photo.
export async function uploadProfilePhoto(
  bytes: Uint8Array,
  previousPath: string | null,
): Promise<string> {
  const userId = await getUserId();
  const path = `${userId}/${randomId()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ photo_path: path })
    .eq("id", userId);
  if (profileError) {
    // Le profil n'a pas changé : on ne laisse pas un fichier que rien ne référence.
    await supabase.storage.from(BUCKET).remove([path]);
    throw profileError;
  }

  // L'ancienne photo ne sert plus. Un échec ici ne change rien pour l'utilisateur.
  if (previousPath) await supabase.storage.from(BUCKET).remove([previousPath]);
  return path;
}

// Retour à l'avatar dessiné (ou à l'initiale) : le profil d'abord, puis le fichier.
export async function removeProfilePhoto(path: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from("profiles").update({ photo_path: null }).eq("id", userId);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([path]);
}

// Avant de supprimer le compte : Supabase interdit d'effacer un fichier en SQL
// (protect_objects_delete), la base ne peut donc pas le faire elle-même. Lève une erreur si
// la suppression échoue : le compte n'est alors pas supprimé (rien ne reste derrière).
export async function removeAllMyPhotos(): Promise<void> {
  const userId = await getUserId();
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  if (data.length === 0) return;
  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove(data.map((file) => `${userId}/${file.name}`));
  if (removeError) throw removeError;
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();
const pending = new Map<string, Promise<string | null>>();

// À la déconnexion : un lien temporaire fonctionne pour qui le détient. Sur un téléphone
// partagé, le compte suivant ne doit pas réutiliser ceux du précédent.
export function clearPhotoUrlCache(): void {
  urlCache.clear();
  pending.clear();
}

// Lien temporaire vers une photo, mis en cache : un écran avec 8 avatars ne fait pas 8
// demandes à chaque rechargement. null : photo inaccessible (supprimée, plus de groupe commun).
export function getPhotoUrl(path: string, bucket: string = BUCKET): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = urlCache.get(key);
  if (cached && cached.expiresAt - URL_MARGIN_MS > Date.now()) return Promise.resolve(cached.url);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(path, URL_LIFETIME_S)
    .then(({ data, error }) => {
      if (error || !data) return null;
      urlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + URL_LIFETIME_S * 1000 });
      return data.signedUrl;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

// La photo d'une recette (JPEG déjà réduit) : envoyée dans le dossier du foyer, enregistrée
// sur la recette, puis l'ancienne supprimée. Renvoie le chemin de la nouvelle.
export async function uploadRecipePhoto(
  groupId: string,
  recipeId: string,
  bytes: Uint8Array,
  previousPath: string | null,
): Promise<string> {
  const path = `${groupId}/${randomId()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(RECIPE_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { error: recipeError } = await supabase
    .from("recipes")
    .update({ photo_path: path })
    .eq("id", recipeId);
  if (recipeError) {
    // La recette n'a pas changé : on ne laisse pas un fichier que rien ne référence.
    await supabase.storage.from(RECIPE_BUCKET).remove([path]);
    throw recipeError;
  }

  // L'ancienne photo ne sert plus. Un échec ici ne change rien pour l'utilisateur.
  if (previousPath) await removeOwnRecipePhoto(previousPath);
  return path;
}

// Retirer la photo d'une recette : la recette d'abord, puis le fichier.
export async function removeRecipePhoto(recipeId: string, path: string): Promise<void> {
  const { error } = await supabase.from("recipes").update({ photo_path: null }).eq("id", recipeId);
  if (error) throw error;
  await removeOwnRecipePhoto(path);
}

// Après le retrait d'une recette : son fichier ne sert plus (Supabase interdit de l'effacer
// en SQL). Un échec laisse un fichier orphelin, sans gêner personne (purge prévue au backlog).
export async function removeRecipePhotoFile(path: string): Promise<void> {
  await removeOwnRecipePhoto(path);
}
