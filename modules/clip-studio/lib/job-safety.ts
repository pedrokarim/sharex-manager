/**
 * Garde-fous communs des travaux lourds du module (récupération par adresse,
 * découpe, transcription, import de Pexels), côté serveur seulement :
 *
 * - place libre sur le disque, contrôlée avant de lancer un travail ;
 * - messages d’erreur rangés avec les travaux, sans chemin du serveur (le
 *   détail reste dans les journaux du serveur) ;
 * - ménage des dossiers de travail cachés laissés par un arrêt brutal.
 */

import fs from "fs";
import path from "path";
import { DATA_DIR } from "./store";

// ─── Place sur le disque ─────────────────────────────────────────

/** Marge gardée libre en plus de la taille attendue d’un travail. */
export const DISK_MARGIN_BYTES = 2 * 1024 * 1024 * 1024;

/** Remplaçable dans les tests. */
export const diskDeps = {
  statfs: (dir: string): { bavail: number | bigint; bsize: number | bigint } => fs.statfsSync(dir),
};

/** Octets libres pour le serveur dans le système de fichiers de `dir`, ou `null` si illisible. */
export function freeDiskBytes(dir: string): number | null {
  try {
    const stats = diskDeps.statfs(dir);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return Number.isFinite(free) && free >= 0 ? free : null;
  } catch (error) {
    console.error("[clip-studio] place libre illisible :", error instanceof Error ? error.message : error);
    return null;
  }
}

/** « 1,5 Go », « 300 Mo ». */
export function bytesLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1).replace(".", ",")} Go` : `${Math.max(1, Math.round(mb))} Mo`;
}

/**
 * Refuse de lancer un travail qui pourrait écrire jusqu’à `expectedBytes`
 * quand le disque n’a pas cette place plus la marge de 2 Go. Une place
 * illisible (système qui ne la donne pas) ne bloque pas.
 */
export function assertDiskSpace(dir: string, expectedBytes: number, margin = DISK_MARGIN_BYTES): void {
  const free = freeDiskBytes(dir);
  if (free === null) return;
  const needed = Math.max(0, expectedBytes) + margin;
  if (free < needed) {
    throw new Error(
      `Disque presque plein sur le serveur : ce travail demande ${bytesLabel(needed)} de libre, il en reste ${bytesLabel(free)}. Supprimez des médias ou des exports, puis réessayez.`
    );
  }
}

// ─── Messages d’erreur ───────────────────────────────────────────

export const DISK_FULL_MESSAGE = "Disque plein sur le serveur : supprimez des médias ou des exports, puis réessayez.";

/** Retire d’un texte les chemins de fichiers du serveur (Windows et Unix). */
export function stripServerPaths(text: string): string {
  return text
    .replace(/'(?:[A-Za-z]:)?[\\/][^'\n]*'/g, "'…'")
    .replace(/"(?:[A-Za-z]:)?[\\/][^"\n]*"/g, "\"…\"")
    // Lettre de lecteur seule (pas le « s: » de « https: »), ou chemin réseau.
    .replace(/(?:(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\)[^\s'"]+/g, "…")
    .replace(/(?<![\w.:/])\/[^\s'"]*\/[^\s'"]*/g, "…");
}

/**
 * Message d’une erreur, sûr à ranger avec un travail et à montrer : erreur
 * système (disque plein, droits) traduite, chemins retirés. Le détail
 * complet part dans les journaux du serveur.
 */
export function publicErrorMessage(error: unknown, fallback: string, context = "[clip-studio]"): string {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const syscall = error && typeof error === "object" ? (error as { syscall?: unknown }).syscall : undefined;
  if (typeof code === "string" && /^E[A-Z]+$/.test(code) && (typeof syscall === "string" || code === "ENOSPC" || code === "EDQUOT")) {
    console.error(`${context} erreur système :`, error instanceof Error ? error.message : error);
    if (code === "ENOSPC" || code === "EDQUOT") return DISK_FULL_MESSAGE;
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return "Le serveur n’a pas le droit d’écrire dans son dossier de données : un administrateur doit vérifier les droits.";
    }
    return `${fallback.replace(/\.$/, "")} (erreur du serveur ${code}).`;
  }
  if (error instanceof Error && error.message) {
    const clean = stripServerPaths(error.message).replace(/\s+/g, " ").trim().slice(0, 400);
    if (clean !== error.message) console.error(`${context} erreur :`, error.message);
    if (/no space left on device/i.test(error.message)) return DISK_FULL_MESSAGE;
    return clean || fallback;
  }
  return fallback;
}

// ─── Dossiers de travail ─────────────────────────────────────────

/** Dossiers de travail cachés (jamais servis par la route des données). */
export const WORK_DIR_NAMES = [".remote-tmp", ".clip-tmp", ".video-tmp", ".transcribe-tmp"] as const;
/** Âge au-delà duquel une entrée d’un dossier de travail est effacée, si aucun travail ne la tient. */
export const WORK_DIR_TTL_MS = 6 * 60 * 60 * 1000;

const workState = ((globalThis as any).__sxmClipWorkDirs ??= {
  held: new Map<string, number>(),
  timer: null as ReturnType<typeof setInterval> | null,
}) as { held: Map<string, number>; timer: ReturnType<typeof setInterval> | null };

/**
 * Note qu’un travail se sert de `dir` : le ménage n’y touche pas tant que la
 * fonction rendue n’a pas été appelée (un travail de plusieurs heures reste
 * protégé).
 */
export function holdWorkDir(dir: string): () => void {
  const key = path.resolve(dir);
  workState.held.set(key, (workState.held.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (workState.held.get(key) ?? 1) - 1;
    if (count > 0) workState.held.set(key, count);
    else workState.held.delete(key);
  };
}

/**
 * Efface les entrées des dossiers de travail plus vieilles que six heures,
 * sauf celles d’un travail en cours. Renvoie les chemins effacés.
 */
export function sweepWorkDirs(now = Date.now(), root = DATA_DIR, isActive: (name: string) => boolean = () => false): string[] {
  const removed: string[] = [];
  for (const dirName of WORK_DIR_NAMES) {
    const dir = path.join(root, dirName);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const full = path.join(dir, name);
      if (workState.held.has(path.resolve(full)) || isActive(name)) continue;
      try {
        if (now - fs.statSync(full).mtimeMs <= WORK_DIR_TTL_MS) continue;
        fs.rmSync(full, { recursive: true, force: true });
        removed.push(full);
      } catch {
        // Effacé entre-temps, ou illisible : le prochain passage réessaiera.
      }
    }
  }
  return removed;
}

/** Ménage au démarrage, puis toutes les heures, sans retenir le processus. */
export function startWorkDirSweeper(): void {
  try {
    sweepWorkDirs();
  } catch {
    // Un dossier illisible ne doit pas empêcher le module de démarrer.
  }
  if (workState.timer) return;
  workState.timer = setInterval(() => {
    try {
      sweepWorkDirs();
    } catch {
      // Réessayé à l’heure suivante.
    }
  }, 60 * 60 * 1000);
  (workState.timer as unknown as { unref?: () => void }).unref?.();
}
