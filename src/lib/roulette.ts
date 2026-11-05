// Déroulé de la roulette : quelques tours, puis arrêt sur le gagnant, de plus en plus lentement.
// Le gagnant est déjà tiré et enregistré par close_session : l'animation ne décide de rien,
// elle s'arrête sur ce résultat, le même sur tous les téléphones.

export type SpinStep = { index: number; delayMs: number };

const MIN_STEPS = 16;
const FIRST_DELAY_MS = 60;
const LAST_DELAY_MS = 420;

// Fonction pure : mêmes paramètres, même déroulé.
export function buildSpin(candidateCount: number, winnerIndex: number): SpinStep[] {
  if (candidateCount < 2 || winnerIndex < 0 || winnerIndex >= candidateCount) return [];

  const laps = Math.max(3, Math.ceil(MIN_STEPS / candidateCount));
  // Dernière étape : laps * candidateCount + winnerIndex, dont le reste vaut winnerIndex.
  const stepCount = laps * candidateCount + winnerIndex + 1;

  return Array.from({ length: stepCount }, (_, step) => {
    const progress = step / (stepCount - 1);
    // Courbe cubique : rapide au début, freine fort à la fin.
    const delayMs = FIRST_DELAY_MS + (LAST_DELAY_MS - FIRST_DELAY_MS) * progress ** 3;
    return { index: step % candidateCount, delayMs: Math.round(delayMs) };
  });
}
