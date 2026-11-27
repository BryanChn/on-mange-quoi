// Sans React Native (testé avec node) : la logique de repli des retours haptiques.

// Joue le premier effet que le téléphone sait jouer. Sur Android, les constantes récentes
// (Toggle, Segment : Android 14) lèvent une erreur sur un téléphone plus ancien : on passe
// alors à l'effet suivant, plus ancien. Si aucun ne marche, rien ne se passe (jamais bloquant).
export async function playFirstSupported<T>(
  effects: readonly T[],
  play: (effect: T) => Promise<unknown>,
): Promise<T | null> {
  for (const effect of effects) {
    try {
      await play(effect);
      return effect;
    } catch {
      // Effet inconnu de ce téléphone : on essaie le suivant.
    }
  }
  return null;
}
