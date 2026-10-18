/**
 * Propriétaire d'un fichier envoyé, déduit de l'historique des envois.
 *
 * L'historique note qui a envoyé chaque fichier : l'identifiant du compte pour
 * un envoi depuis l'interface, l'identifiant de la clé API pour un envoi
 * ShareX (la clé, elle, connaît le compte qui l'a créée). Un fichier sans
 * entrée, ou dont l'auteur ne se retrouve pas (clé supprimée, entrée
 * ancienne sans compte), n'a pas de propriétaire connu : seul un admin peut
 * alors le supprimer ou changer sa visibilité.
 */

import { getAllHistory } from "@/lib/history";
import { isAdmin } from "@/lib/api-guard";
import type { HistoryEntry } from "@/lib/types/history";
import type { ApiKey } from "@/types/api-key";
import type { Session } from "@/lib/auth";
import { readStoredApiKeys as readApiKeys } from "@/lib/api-key-store";

/**
 * Compte propriétaire d'une entrée d'historique, ou `null` s'il ne se
 * retrouve pas. Une entrée envoyée par clé API porte l'identifiant de la clé.
 */
export function ownerOfEntry(entry: HistoryEntry, keys: ApiKey[]): string | null {
  const id = entry.userId;
  if (!id) return null;
  if (entry.uploadMethod === "api" || id.startsWith("key_")) {
    const key = keys.find((candidate) => candidate.id === id);
    const owner = key?.createdBy;
    return owner && owner !== "system" ? owner : null;
  }
  return id;
}

/**
 * Propriétaire de chaque fichier demandé. Le dernier envoi d'un nom compte :
 * un nom gardé tel quel (« conserver les noms ») peut avoir été réécrit.
 */
export async function getFileOwners(filenames: string[]): Promise<Map<string, string | null>> {
  const wanted = new Set(filenames);
  const [history, keys] = await Promise.all([getAllHistory(), readApiKeys()]);
  const latest = new Map<string, HistoryEntry>();
  for (const entry of history) {
    if (!wanted.has(entry.filename)) continue;
    const previous = latest.get(entry.filename);
    if (!previous || entry.uploadDate >= previous.uploadDate) latest.set(entry.filename, entry);
  }
  const owners = new Map<string, string | null>();
  for (const name of wanted) {
    const entry = latest.get(name);
    owners.set(name, entry ? ownerOfEntry(entry, keys) : null);
  }
  return owners;
}

export async function getFileOwner(filename: string): Promise<string | null> {
  return (await getFileOwners([filename])).get(filename) ?? null;
}

/** Vrai si la session peut supprimer le fichier ou changer sa visibilité. */
export async function canManageFile(session: Session, filename: string): Promise<boolean> {
  if (isAdmin(session)) return true;
  const owner = await getFileOwner(filename);
  return owner !== null && owner === session.user.id;
}

/** Entrées d'historique envoyées par ce compte, depuis l'interface ou par une de ses clés. */
export async function historyOwnedBy(entries: HistoryEntry[], userId: string): Promise<HistoryEntry[]> {
  const keys = await readApiKeys();
  return entries.filter((entry) => ownerOfEntry(entry, keys) === userId);
}
