// File d'attente : chaque tâche démarre quand la précédente est terminée, réussie ou non.
// Sert aux votes optimistes : cocher puis décocher vite envoie deux requêtes, qui doivent
// arriver au serveur dans l'ordre des touchers (sinon l'état final serait faux).
// Sans import, testable avec node --test (serial-queue.test.ts).
export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

export function createSerialQueue(): SerialQueue {
  let last: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = last.then(task);
    // Un échec ne bloque pas la suite ; celui qui a mis la tâche en file le reçoit quand même.
    last = result.catch(() => undefined);
    return result;
  };
}
