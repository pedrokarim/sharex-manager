/**
 * Une seule horloge `requestAnimationFrame` pour toutes les vignettes
 * animées : elle ne tourne que tant qu'une vignette au moins est abonnée
 * (survolée ou sélectionnée au clavier), et s'arrête d'elle-même ensuite.
 */

export type TickListener = (now: number) => void;

const listeners = new Set<TickListener>();
let handle = 0;

function tick(now: number) {
  handle = 0;
  for (const listener of listeners) listener(now);
  if (listeners.size > 0) handle = requestAnimationFrame(tick);
}

/** Abonne une fonction à chaque image ; rend la fonction de désabonnement. */
export function subscribeTick(listener: TickListener): () => void {
  listeners.add(listener);
  if (!handle && typeof requestAnimationFrame === "function") handle = requestAnimationFrame(tick);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}

/** Nombre d'abonnés en cours (tests et diagnostic). */
export function activeTickCount(): number {
  return listeners.size;
}
