/**
 * Compteurs d'échecs de connexion, gardés dans `data/security.db` : un
 * redémarrage du serveur ne lève pas un blocage en cours.
 */

import { UNKNOWN_CLIENT_IP } from "@/lib/request-ip";
import { securityDb } from "./security-db";
import { getSignInSettings } from "./settings";
import {
  attemptKey,
  lockRemainingMs,
  registerFailure,
  thresholdFor,
  type AttemptScope,
  type AttemptState,
} from "./sign-in-lock";

interface Row {
  failures: number;
  first_failure_at: number;
  last_failure_at: number;
  locked_until: number | null;
}

function keysFor(identifier: string, ip: string): { scope: AttemptScope; key: string }[] {
  const keys: { scope: AttemptScope; key: string }[] = [];
  if (identifier.trim()) keys.push({ scope: "user", key: attemptKey("user", identifier) });
  if (ip && ip !== UNKNOWN_CLIENT_IP) keys.push({ scope: "ip", key: attemptKey("ip", ip) });
  return keys;
}

function readState(key: string): AttemptState | null {
  const row = securityDb()
    .query("SELECT failures, first_failure_at, last_failure_at, locked_until FROM sign_in_attempts WHERE key = ?")
    .get(key) as Row | null;
  if (!row) return null;
  return {
    failures: row.failures,
    firstFailureAt: row.first_failure_at,
    lastFailureAt: row.last_failure_at,
    lockedUntil: row.locked_until,
  };
}

function writeState(key: string, state: AttemptState) {
  securityDb()
    .query(
      `INSERT INTO sign_in_attempts (key, failures, first_failure_at, last_failure_at, locked_until)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         failures = excluded.failures,
         first_failure_at = excluded.first_failure_at,
         last_failure_at = excluded.last_failure_at,
         locked_until = excluded.locked_until`
    )
    .run(key, state.failures, state.firstFailureAt, state.lastFailureAt, state.lockedUntil);
}

/** Blocage en cours pour cet identifiant ou cette adresse. */
export function getSignInLock(identifier: string, ip: string, now = Date.now()) {
  let retryAfterMs = 0;
  let scope: AttemptScope | null = null;
  for (const entry of keysFor(identifier, ip)) {
    const remaining = lockRemainingMs(readState(entry.key), now);
    if (remaining > retryAfterMs) {
      retryAfterMs = remaining;
      scope = entry.scope;
    }
  }
  return { locked: retryAfterMs > 0, retryAfterMs, scope };
}

/** Compte un échec ; `lockedScopes` liste les compteurs que cet échec vient de bloquer. */
export function recordSignInFailure(identifier: string, ip: string, now = Date.now()) {
  const policy = getSignInSettings();
  const lockedScopes: AttemptScope[] = [];
  let failures = 0;
  for (const entry of keysFor(identifier, ip)) {
    const result = registerFailure(readState(entry.key), now, policy, thresholdFor(entry.scope, policy));
    writeState(entry.key, result.state);
    if (result.lockedNow) lockedScopes.push(entry.scope);
    if (entry.scope === "user") failures = result.state.failures;
  }
  return { lockedScopes, failures };
}

/**
 * Une connexion réussie remet à zéro le compteur de l'identifiant. Celui de
 * l'adresse reste : sinon, un compte valide suffirait à effacer les essais
 * faits depuis la même IP sur d'autres comptes.
 */
export function recordSignInSuccess(identifier: string) {
  if (!identifier.trim()) return;
  securityDb().query("DELETE FROM sign_in_attempts WHERE key = ?").run(attemptKey("user", identifier));
}

/** Ménage des compteurs dont le dernier échec est plus ancien que `olderThan`. */
export function purgeSignInAttempts(olderThan: number): number {
  const result = securityDb()
    .query("DELETE FROM sign_in_attempts WHERE last_failure_at < ? AND (locked_until IS NULL OR locked_until < ?)")
    .run(olderThan, olderThan);
  return result.changes;
}
