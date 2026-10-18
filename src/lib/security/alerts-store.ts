/**
 * Stockage des alertes de sécurité (`data/security.db`) : liste, lecture,
 * ménage, et suivi des adresses des administrateurs. Pour lever une alerte,
 * passer par `raiseAlert` (`alerts.ts`).
 */

import { UNKNOWN_CLIENT_IP } from "@/lib/request-ip";
import { securityDb } from "./security-db";
import type { AlertKind } from "./settings-schema";

export type { AlertKind } from "./settings-schema";

export type AlertDetails = Record<string, string | number | boolean | null | undefined>;

export interface SecurityAlert {
  id: number;
  kind: AlertKind;
  createdAt: string;
  details: AlertDetails;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

interface AlertRow {
  id: number;
  kind: AlertKind;
  created_at: string;
  details: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

function toAlert(row: AlertRow): SecurityAlert {
  let details: AlertDetails = {};
  try {
    details = row.details ? (JSON.parse(row.details) as AlertDetails) : {};
  } catch {
    details = {};
  }
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    details,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
  };
}

/** Écrit une alerte ; préférer `raiseAlert` (`alerts.ts`), qui respecte les réglages et ne lève jamais. */
export function insertAlert(kind: AlertKind, details: AlertDetails): number {
  const result = securityDb()
    .query("INSERT INTO alerts (kind, created_at, details) VALUES (?, ?, ?)")
    .run(kind, new Date().toISOString(), JSON.stringify(details));
  return Number(result.lastInsertRowid);
}

export function listAlerts(options: { includeAcknowledged?: boolean; limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const where = options.includeAcknowledged ? "" : "WHERE acknowledged_at IS NULL";
  const rows = securityDb()
    .query(`SELECT * FROM alerts ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as AlertRow[];
  const { count } = securityDb().query("SELECT COUNT(*) AS count FROM alerts WHERE acknowledged_at IS NULL").get() as {
    count: number;
  };
  return { alerts: rows.map(toAlert), unacknowledged: count };
}

/** Marque une alerte comme vue. Faux si elle n'existe pas ou l'était déjà. */
export function acknowledgeAlert(id: number, userId: string): boolean {
  const result = securityDb()
    .query("UPDATE alerts SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND acknowledged_at IS NULL")
    .run(new Date().toISOString(), userId, id);
  return result.changes > 0;
}

export function acknowledgeAllAlerts(userId: string): number {
  const result = securityDb()
    .query("UPDATE alerts SET acknowledged_at = ?, acknowledged_by = ? WHERE acknowledged_at IS NULL")
    .run(new Date().toISOString(), userId);
  return result.changes;
}

/** Ménage des alertes déjà vues, plus anciennes que `olderThan` (ISO). */
export function purgeAcknowledgedAlerts(olderThan: string): number {
  const result = securityDb()
    .query("DELETE FROM alerts WHERE acknowledged_at IS NOT NULL AND created_at < ?")
    .run(olderThan);
  return result.changes;
}

/**
 * Note l'adresse d'une connexion administrateur. `isNew` : jamais vue pour ce
 * compte alors qu'il en a déjà d'autres (la toute première connexion ne
 * déclenche rien). Une adresse inconnue n'est pas retenue.
 */
export function noteAdminSignIn(userId: string, ip: string): { isNew: boolean } {
  if (!ip || ip === UNKNOWN_CLIENT_IP) return { isNew: false };
  const db = securityDb();
  const now = new Date().toISOString();
  const known = db.query("SELECT 1 FROM admin_known_ips WHERE user_id = ? AND ip = ?").get(userId, ip);
  if (known) {
    db.query("UPDATE admin_known_ips SET last_seen_at = ? WHERE user_id = ? AND ip = ?").run(now, userId, ip);
    return { isNew: false };
  }
  const { count } = db.query("SELECT COUNT(*) AS count FROM admin_known_ips WHERE user_id = ?").get(userId) as {
    count: number;
  };
  db.query("INSERT INTO admin_known_ips (user_id, ip, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)").run(
    userId,
    ip,
    now,
    now
  );
  return { isNew: count > 0 };
}
