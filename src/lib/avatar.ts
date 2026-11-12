// Fonctions pures de l'avatar : mêmes entrées, mêmes sorties, rien d'autre ne change.

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
