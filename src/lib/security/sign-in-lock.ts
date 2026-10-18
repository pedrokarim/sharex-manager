/**
 * Règles du verrouillage après des échecs de connexion, sans accès à la
 * base : testables sous Node. Le stockage vit dans `sign-in-attempts.ts`.
 *
 * Deux compteurs par tentative : l'identifiant saisi et l'adresse IP. Le
 * compteur d'une IP tolère plus d'échecs (plusieurs personnes derrière la
 * même box ou le même réseau d'entreprise) ; une adresse inconnue n'a pas de
 * compteur, sans quoi tous les clients sans IP partageraient le même blocage.
 */

export interface AttemptState {
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  lockedUntil: number | null;
}

export interface LockPolicy {
  maxAttempts: number;
  lockMinutes: number;
}

/** Une IP est bloquée au triple du seuil d'un identifiant. */
export const IP_THRESHOLD_FACTOR = 3;

export type AttemptScope = "user" | "ip";

export function attemptKey(scope: AttemptScope, value: string): string {
  return `${scope}:${value.trim().toLowerCase()}`;
}

export function thresholdFor(scope: AttemptScope, policy: LockPolicy): number {
  return scope === "ip" ? policy.maxAttempts * IP_THRESHOLD_FACTOR : policy.maxAttempts;
}

/** Temps restant avant la fin du blocage, en millisecondes ; 0 si rien n'est bloqué. */
export function lockRemainingMs(state: AttemptState | null | undefined, now: number): number {
  if (!state?.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil - now);
}

/**
 * Compte un échec. Les échecs se comptent sur une fenêtre de `lockMinutes` :
 * au-delà, ou une fois un blocage terminé, le compteur repart de zéro.
 * `lockedNow` vaut vrai à l'échec qui déclenche le blocage, et à lui seul.
 */
export function registerFailure(
  state: AttemptState | null | undefined,
  now: number,
  policy: LockPolicy,
  threshold = policy.maxAttempts
): { state: AttemptState; lockedNow: boolean } {
  const windowMs = policy.lockMinutes * 60_000;
  const expired =
    !state ||
    now - state.firstFailureAt > windowMs ||
    (state.lockedUntil !== null && state.lockedUntil <= now);

  const failures = expired ? 1 : state.failures + 1;
  const base: AttemptState = expired
    ? { failures, firstFailureAt: now, lastFailureAt: now, lockedUntil: null }
    : { ...state, failures, lastFailureAt: now };

  const alreadyLocked = lockRemainingMs(base, now) > 0;
  if (!alreadyLocked && failures >= threshold) {
    return { state: { ...base, lockedUntil: now + windowMs }, lockedNow: true };
  }
  return { state: base, lockedNow: false };
}
