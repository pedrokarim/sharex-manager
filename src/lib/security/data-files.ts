/**
 * Droits des fichiers de données du cœur : dossier `data/` en 0700, fichiers
 * sensibles en 0600 (clés API, historique, fichiers privés, jetons de
 * suppression, bases d'authentification et de journal).
 *
 * Les fichiers JSON sont réécrits sur place par leurs modules : un fichier
 * passé en 0600 le reste. Ce passage au démarrage rattrape les fichiers créés
 * avant cette règle, ou par un outil extérieur. Sans effet sous Windows, où
 * les droits POSIX n'existent pas.
 */

import fs from "fs";
import path from "path";

export const PRIVATE_DATA_FILES = [
  "api-keys.json",
  "history.json",
  "secure-files.json",
  "deletion-tokens.json",
  "users.json",
  "security.json",
  "auth.db",
  "logs.db",
  "security.db",
] as const;

/** Fichiers annexes de SQLite, qui contiennent les mêmes données que la base. */
const SQLITE_SIDE_FILES = ["-wal", "-shm"];

export function hardenDataFiles(dataDir = path.join(/* turbopackIgnore: true */ process.cwd(), "data")): number {
  if (process.platform === "win32") return 0;
  let changed = 0;
  const tighten = (target: string, mode: number) => {
    try {
      const current = fs.statSync(target).mode & 0o777;
      if ((current & ~mode) === 0) return;
      fs.chmodSync(target, mode);
      changed++;
    } catch {
      // Absent, ou appartenant à un autre compte : on n'insiste pas.
    }
  };

  tighten(dataDir, 0o700);
  for (const name of PRIVATE_DATA_FILES) {
    const file = path.join(dataDir, name);
    tighten(file, 0o600);
    if (name.endsWith(".db")) {
      for (const suffix of SQLITE_SIDE_FILES) tighten(`${file}${suffix}`, 0o600);
    }
  }
  return changed;
}
