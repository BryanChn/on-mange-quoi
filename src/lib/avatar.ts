// Fonctions pures de l'avatar : mêmes entrées, mêmes sorties, rien d'autre ne change.

// Avatars prédéfinis : même liste que la contrainte profiles_avatar_check (migration
// profile_avatar). Les dessins sont dans assets/images/avatars/<id>.svg.
export const AVATAR_IDS = ["chat", "spaghetti", "pizza", "burger", "avocat", "ramen"] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const AVATAR_LABELS: Record<AvatarId, string> = {
  chat: "Le chat",
  spaghetti: "Spaghetti",
  pizza: "Pizza",
  burger: "Burger",
  avocat: "Avocat",
  ramen: "Ramen",
};

// Fond du rond, le même en clair et en sombre (comme une photo). Le visage du chat a la
// couleur de son fond : changer l'une, c'est changer l'autre (chat.svg).
export const AVATAR_BACKGROUNDS: Record<AvatarId, string> = {
  chat: "#FFD3C9",
  spaghetti: "#CDE8D6",
  pizza: "#FFE2DA",
  burger: "#FFF1E2",
  avocat: "#F6B828",
  ramen: "#FBE6D2",
};

// Valeur lue en base : une valeur inconnue (ajoutée par une version plus récente de l'app)
// revient à l'initiale au lieu de casser l'affichage.
export function toAvatarId(value: string | null | undefined): AvatarId | null {
  return (AVATAR_IDS as readonly string[]).includes(value ?? "") ? (value as AvatarId) : null;
}

// Initiale affichée dans le rond : « bryan » → « B », «  léa » → « L », nom vide → « ? ».
export function getInitial(name: string): string {
  // Array.from découpe par caractère : un emoji (deux unités de code) reste entier.
  const firstLetter = Array.from(name.trim())[0] ?? "";
  return firstLetter === "" ? "?" : firstLetter.toUpperCase();
}

// Couleur de fond de l'avatar : toujours la même pour un même nom, pour qu'on reconnaisse
// quelqu'un à sa couleur d'un écran à l'autre. Le nom devient un nombre (somme des codes
// de ses caractères), ramené à un index du tableau par le modulo.
export function pickAvatarColor(name: string, palette: readonly string[]): string {
  let sum = 0;
  for (let index = 0; index < name.length; index += 1) {
    sum += name.charCodeAt(index);
  }
  return palette[sum % palette.length];
}
